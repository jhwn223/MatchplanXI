import algFlag from "flag-icons/flags/4x3/dz.svg";
import argFlag from "flag-icons/flags/4x3/ar.svg";
import ausFlag from "flag-icons/flags/4x3/au.svg";
import autFlag from "flag-icons/flags/4x3/at.svg";
import belFlag from "flag-icons/flags/4x3/be.svg";
import bihFlag from "flag-icons/flags/4x3/ba.svg";
import braFlag from "flag-icons/flags/4x3/br.svg";
import canFlag from "flag-icons/flags/4x3/ca.svg";
import civFlag from "flag-icons/flags/4x3/ci.svg";
import codFlag from "flag-icons/flags/4x3/cd.svg";
import colFlag from "flag-icons/flags/4x3/co.svg";
import cpvFlag from "flag-icons/flags/4x3/cv.svg";
import croFlag from "flag-icons/flags/4x3/hr.svg";
import cuwFlag from "flag-icons/flags/4x3/cw.svg";
import czeFlag from "flag-icons/flags/4x3/cz.svg";
import ecuFlag from "flag-icons/flags/4x3/ec.svg";
import egyFlag from "flag-icons/flags/4x3/eg.svg";
import engFlag from "flag-icons/flags/4x3/gb-eng.svg";
import espFlag from "flag-icons/flags/4x3/es.svg";
import fraFlag from "flag-icons/flags/4x3/fr.svg";
import gerFlag from "flag-icons/flags/4x3/de.svg";
import ghaFlag from "flag-icons/flags/4x3/gh.svg";
import haiFlag from "flag-icons/flags/4x3/ht.svg";
import irnFlag from "flag-icons/flags/4x3/ir.svg";
import irqFlag from "flag-icons/flags/4x3/iq.svg";
import jorFlag from "flag-icons/flags/4x3/jo.svg";
import jpnFlag from "flag-icons/flags/4x3/jp.svg";
import korFlag from "flag-icons/flags/4x3/kr.svg";
import ksaFlag from "flag-icons/flags/4x3/sa.svg";
import marFlag from "flag-icons/flags/4x3/ma.svg";
import mexFlag from "flag-icons/flags/4x3/mx.svg";
import nedFlag from "flag-icons/flags/4x3/nl.svg";
import norFlag from "flag-icons/flags/4x3/no.svg";
import nzlFlag from "flag-icons/flags/4x3/nz.svg";
import panFlag from "flag-icons/flags/4x3/pa.svg";
import parFlag from "flag-icons/flags/4x3/py.svg";
import porFlag from "flag-icons/flags/4x3/pt.svg";
import qatFlag from "flag-icons/flags/4x3/qa.svg";
import rsaFlag from "flag-icons/flags/4x3/za.svg";
import scoFlag from "flag-icons/flags/4x3/gb-sct.svg";
import senFlag from "flag-icons/flags/4x3/sn.svg";
import suiFlag from "flag-icons/flags/4x3/ch.svg";
import sweFlag from "flag-icons/flags/4x3/se.svg";
import tunFlag from "flag-icons/flags/4x3/tn.svg";
import turFlag from "flag-icons/flags/4x3/tr.svg";
import uruFlag from "flag-icons/flags/4x3/uy.svg";
import usaFlag from "flag-icons/flags/4x3/us.svg";
import uzbFlag from "flag-icons/flags/4x3/uz.svg";

const FLAGS_BY_FIFA_CODE: Record<string, string> = {
  ALG: algFlag,
  ARG: argFlag,
  AUS: ausFlag,
  AUT: autFlag,
  BEL: belFlag,
  BIH: bihFlag,
  BRA: braFlag,
  CAN: canFlag,
  CIV: civFlag,
  COD: codFlag,
  COL: colFlag,
  CPV: cpvFlag,
  CRO: croFlag,
  CUW: cuwFlag,
  CZE: czeFlag,
  ECU: ecuFlag,
  EGY: egyFlag,
  ENG: engFlag,
  ESP: espFlag,
  FRA: fraFlag,
  GER: gerFlag,
  GHA: ghaFlag,
  HAI: haiFlag,
  IRN: irnFlag,
  IRQ: irqFlag,
  JOR: jorFlag,
  JPN: jpnFlag,
  KOR: korFlag,
  KSA: ksaFlag,
  MAR: marFlag,
  MEX: mexFlag,
  NED: nedFlag,
  NOR: norFlag,
  NZL: nzlFlag,
  PAN: panFlag,
  PAR: parFlag,
  POR: porFlag,
  QAT: qatFlag,
  RSA: rsaFlag,
  SCO: scoFlag,
  SEN: senFlag,
  SUI: suiFlag,
  SWE: sweFlag,
  TUN: tunFlag,
  TUR: turFlag,
  URU: uruFlag,
  USA: usaFlag,
  UZB: uzbFlag,
};

interface TeamFlagProps {
  fifaCode: string;
  className?: string;
}

export function TeamFlag({ fifaCode, className = "" }: TeamFlagProps) {
  const flagUrl = FLAGS_BY_FIFA_CODE[fifaCode.toUpperCase()];

  if (!flagUrl) {
    return <span className={`team-flag team-flag--fallback ${className}`.trim()} aria-hidden="true" />;
  }

  return <img className={`team-flag ${className}`.trim()} src={flagUrl} alt="" aria-hidden="true" />;
}
