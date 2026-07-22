import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Papa from "papaparse";

const ROOT = process.cwd();
const PLAYER_CSV = path.join(ROOT, "public", "data", "squads_and_players.csv");
const TEAM_CSV = path.join(ROOT, "public", "data", "teams.csv");
const PHOTO_DIR = path.join(ROOT, "public", "player-photos");
const MANIFEST_PATH = path.join(ROOT, "src", "assets", "player-photos", "manifest.json");
const REPORT_PATH = path.join(PHOTO_DIR, "sync-report.json");
const ATTRIBUTION_PATH = path.join(PHOTO_DIR, "ATTRIBUTION.md");

const USER_AGENT = "AltitudeTactics/1.0 (https://github.com/jhwn223/altitude-tactics)";
const ALLOWED_LICENSE = /^(CC0|Public domain|CC[- ]BY(?:[- ]SA)?(?: |$)|Creative Commons Attribution)/i;
const DISALLOWED_LICENSE = /(?:NC|ND|NonCommercial|NoDerivatives)/i;

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, raw = "true"] = value.replace(/^--/, "").split("=");
    return [key, raw];
  })
);
const teamFilter = args.get("team")?.toUpperCase();
const limit = Number(args.get("limit") ?? Number.POSITIVE_INFINITY);
const perTeam = Number(args.get("per-team") ?? Number.POSITIVE_INFINITY);
const concurrency = Math.max(1, Math.min(8, Number(args.get("concurrency") ?? 4)));

function parseCsv(text) {
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function htmlToText(value = "") {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function claimValue(entity, property) {
  return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
}

function claimDate(entity, property) {
  const value = claimValue(entity, property);
  return typeof value?.time === "string" ? value.time.slice(1, 11) : null;
}

async function request(url, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) return response;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw new Error(`Request failed: ${url}`);
}

async function requestJson(baseUrl, parameters) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return (await request(url)).json();
}

async function findWikidataEntity(player) {
  const search = await requestJson("https://www.wikidata.org/w/api.php", {
    action: "wbsearchentities",
    search: player.player_name,
    language: "en",
    uselang: "en",
    type: "item",
    limit: 8,
    format: "json",
    origin: "*",
  });
  const ids = search.search?.map((entry) => entry.id).filter(Boolean) ?? [];
  if (!ids.length) return null;

  const entitiesResponse = await requestJson("https://www.wikidata.org/w/api.php", {
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "claims|labels",
    languages: "en",
    format: "json",
    origin: "*",
  });

  const entities = ids.map((id) => entitiesResponse.entities?.[id]).filter(Boolean);
  return (
    entities.find(
      (entity) => claimDate(entity, "P569") === player.date_of_birth && claimValue(entity, "P18")
    ) ?? null
  );
}

async function getCommonsPhoto(fileName) {
  const response = await requestJson("https://commons.wikimedia.org/w/api.php", {
    action: "query",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: 320,
    iiextmetadatalanguage: "en",
    iiextmetadatafilter:
      "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms|ImageDescription",
    format: "json",
    origin: "*",
  });
  const page = Object.values(response.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl || !info?.extmetadata) return null;

  const meta = info.extmetadata;
  const license = htmlToText(meta.LicenseShortName?.value || meta.UsageTerms?.value);
  if (!ALLOWED_LICENSE.test(license) || DISALLOWED_LICENSE.test(license)) return null;

  return {
    downloadUrl: info.thumburl,
    sourcePageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
    author: htmlToText(meta.Artist?.value) || "Unknown author",
    credit: htmlToText(meta.Credit?.value),
    license,
    licenseUrl: meta.LicenseUrl?.value || "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
    attributionRequired: meta.AttributionRequired?.value !== "false",
  };
}

function extensionFor(contentType, url) {
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/gif")) return "gif";
  if (contentType.includes("image/jpeg")) return "jpg";
  const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif)(?:\/|$)/i);
  return match?.[1]?.replace(/^jpeg$/i, "jpg").toLowerCase() ?? "jpg";
}

async function downloadPhoto(url, playerId) {
  const response = await request(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const extension = extensionFor(response.headers.get("content-type") ?? "", url);
  const fileName = `${playerId}.${extension}`;
  await fs.writeFile(path.join(PHOTO_DIR, fileName), bytes);
  return fileName;
}

async function syncPlayer(player, teamCode) {
  const entity = await findWikidataEntity(player);
  if (!entity) return { ok: false, player, reason: "wikidata-match-not-found" };
  const commonsFile = claimValue(entity, "P18");
  const photo = await getCommonsPhoto(commonsFile);
  if (!photo) return { ok: false, player, reason: "compatible-commons-photo-not-found" };
  const fileName = await downloadPhoto(photo.downloadUrl, player.player_id);

  return {
    ok: true,
    record: {
      playerId: Number(player.player_id),
      playerName: player.player_name,
      teamCode,
      wikidataQid: entity.id,
      commonsFile,
      fileName,
      sourcePageUrl: photo.sourcePageUrl,
      author: photo.author,
      credit: photo.credit,
      license: photo.license,
      licenseUrl: photo.licenseUrl,
      attributionRequired: photo.attributionRequired,
      changes: "Wikimedia-generated 320px thumbnail; displayed with a circular CSS crop.",
    },
  };
}

async function mapConcurrent(items, worker, workerCount) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { ok: false, player: items[index], reason: String(error) };
      }
      const completed = results.filter(Boolean).length;
      if (completed % 25 === 0 || completed === items.length) {
        process.stdout.write(`\rProcessed ${completed}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, run));
  process.stdout.write("\n");
  return results;
}

async function writeOutputs(records, failures) {
  records.sort((a, b) => a.playerId - b.playerId);
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await fs.writeFile(
    REPORT_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        matched: records.length,
        unmatched: failures.length,
        failures: failures.map(({ player, reason }) => ({
          playerId: Number(player.player_id),
          playerName: player.player_name,
          reason,
        })),
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const lines = [
    "# Player photo attribution",
    "",
    "All photographs in this directory originate from Wikimedia Commons.",
    "The license and original source for every photograph are listed below.",
    "",
    "| Player | Author | License | Source |",
    "| --- | --- | --- | --- |",
    ...records.map(
      (record) =>
        `| ${record.playerName.replaceAll("|", "\\|")} | ${record.author.replaceAll("|", "\\|")} | [${record.license}](${record.licenseUrl}) | [Wikimedia Commons](${record.sourcePageUrl}) |`
    ),
    "",
  ];
  await fs.writeFile(ATTRIBUTION_PATH, lines.join("\n"), "utf8");
}

async function main() {
  await fs.mkdir(PHOTO_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  const [playersText, teamsText] = await Promise.all([
    fs.readFile(PLAYER_CSV, "utf8"),
    fs.readFile(TEAM_CSV, "utf8"),
  ]);
  const players = parseCsv(playersText);
  const teams = parseCsv(teamsText);
  const teamCodeById = new Map(teams.map((team) => [team.team_id, team.fifa_code]));

  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    existing = [];
  }
  const existingById = new Map(existing.map((record) => [String(record.playerId), record]));

  const candidates = Number.isFinite(perTeam)
    ? [...players.reduce((groups, player) => {
        const group = groups.get(player.team_id) ?? [];
        group.push(player);
        groups.set(player.team_id, group);
        return groups;
      }, new Map()).values()].flatMap((group) =>
        group
          .sort((a, b) => Number(b.market_value_eur) - Number(a.market_value_eur))
          .slice(0, perTeam)
      )
    : players;

  const selected = candidates
    .filter((player) => !teamFilter || teamCodeById.get(player.team_id) === teamFilter)
    .filter((player) => !existingById.has(String(player.player_id)))
    .slice(0, limit);

  console.log(`Syncing ${selected.length} players with concurrency ${concurrency}`);
  const results = await mapConcurrent(
    selected,
    (player) => syncPlayer(player, teamCodeById.get(player.team_id) ?? ""),
    concurrency
  );
  const added = results.filter((result) => result.ok).map((result) => result.record);
  const failures = results.filter((result) => !result.ok);
  await writeOutputs([...existing, ...added], failures);
  console.log(`Added ${added.length}; total ${existing.length + added.length}; unmatched ${failures.length}`);
}

await main();
