/**
 * The world's land, as the ground-track map draws it.
 *
 * **Generated — do not edit.** `node tools/make-world-outline.mjs` rebuilds it
 * from Natural Earth's 110m land layer, which is in the public domain; that
 * script is where the simplification, the quantisation and the encoding are
 * explained, and it is the only place any of the numbers below come from.
 *
 * 117 rings, 5143 source points simplified to 2402,
 * 7.5 kB of string.
 *
 * Bundled rather than fetched. The map is a backdrop the size of a business
 * card and this is a few kilobytes of it; a tile server would be a network
 * round trip, an attribution and a way for the card to be blank on a phone
 * held up at the sky with no signal.
 */

/** Steps per degree the coordinates below are rounded onto. */
const GRID_PER_DEGREE = 20;

/** base64url, which is what the varints are written in. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** One closed ring of coastline: longitude and latitude in degrees, in pairs. */
export type OutlineRing = readonly (readonly [number, number])[];

/**
 * Rings are delta-encoded varints separated by `!`. See
 * `tools/make-world-outline.mjs`.
 */
const ENCODED =
  "tqChkDXlBtFEnCawFF0BeqBP!_mGrjDtCFlDqBYQqCHyCrB!t4BxhDyBRW9B9InBxEQGS4DY-C-BsEA!v3E77CkDA9BX9CSI" +
  "OwBH!98E77C8BNhEQmCB!37D95C4CAYV3FA9BYmEB!x1C14CNvB7CNzBAUQ7CJfc2DSMkC8BYoCxC!npClwCnEZZbWbhCLrC" +
  "5BiDzB4B5BmB3DrE9B5H3BpIBwEvBrFTBfqDpByT1C8BfyK6B2INyCeoPoBtBsBtHHFsB0IkCiIWmGmBoCaMQpBKoBc-DewC" +
  "uB0DRWekDT0EIQPgKmCoCDyBhBoDkBmCRkFU4CFsBZ2FKkGgBqCuBgGzBkEwB8GkB8IsCoCFgD1BsDZoDWiGVezBDRlCXGPs" +
  "BArBtBsCPuBGyD6C4EQ6BsB0EuB-ECyBmBiClB2HJ8EG-DkCmE3BiFKmEgBwCfqFVmEegHJuHWMkB-B7BiBFiKCuBnB4CTyE" +
  "RoCMkGpB-CnBmHJ8EhBrCtC_DdlDpCBfyBtBqCDQRxGPtCnC8E5BwGlBUToNhBAzG_hOAA0GmBWoCL0BO-BRyFa2DZmLfyDK" +
  "qIT6GWIU9IKtEYmByBHQ_EmB4HJqFoB9DoBnHMrDoBLuB4BPgHDyGkBPeMOsCFsLyB2RH8IgBiCnBqBM0Ef0IDWStBazBEtB" +
  "8B2FLwDb6HMiBeiBR2IhBuBc4GbuJ2BEiBzBuCsB-BLgB-FsDwFyB4BF3BX!10CpjCsDhBRT5BMvBbrBE3DoB_CiCuEvBiBs" +
  "BkBScFkBvB!lpC7_BgBRLN1BLROhBRTSqDe!83Cj-B9BBIuBgCRJZ!41F_yBmBNuCKP7CNKbbfE1BgDCSaD!o4GjzBKRcQMP" +
  "9BvCQThCPhBhCxBdpDSOsBqEyCgC0CcSIP!o6GltBepBAaYnBgBNmCIV5BdAvB1CdPXQYiBNWrBQecG4BxCyDkCbKjB!8wG1" +
  "bNJzBc3BgC6DxC!--G1VIftBAKecC!mgH_UXHFO4BYATZJ!8wG1SGfREFoBSL!y-B9QO1CdAEvBpDhKjCZ1BYf2DsBwCPqDU" +
  "wBqCQ4BwBGmBSFkBmCiB7B!uzFlROfaQgBhBqB9EiD5BiBtCqBBGpBuCnCMfQxCZtElD_ENnCjCNvCxB3BaGU5BjB1DgBrBq" +
  "C5BWEwBTbhBFqBgCDenCvCfQlBsCzDsBvGbtCdVlB1EDrCpB1BA_BiBAYaOAiC9C8GSRNmBgBbhBsCeqDEdQayCuBmFoB4B8" +
  "BCmBciBShBQINSMUSJGgB0B0B2BS0BpByBDHWwBqCwCSBUdOWE2DrBwBQSTnBlBRjC8FrDcOOmBSgFgBmCqB7D!0qGjNMNbC" +
  "PYgBL!82E5MlCcmBIgBjB!ipGpMnBCFWuBX!y7E1MnBDWmBsBa6CK5CnBZd!szEjKyBX_CNuBmB!05EjKFVxDFgBWaL-BS!4" +
  "nEvIuCDISmGrCtBP5HoB1DkBcmBwBB2BhB!soF3HTbM6BId!8iGvIdKZ4B4BhC!g-F7GlCftCW-BKMUEVWEiBcDYgBFNvB!i" +
  "_EpEPNhBYyBJ!ijF7DQd1DSKW8CJ!u_FzFLJRmBlCqBMK0BdkBxB!2nFtBK_BqBXiBqByCY6H1C4B_BiCZKTlBDKbsE_DvDS" +
  "pC0CzBQ5BXEddN_BKjBgBnBI9BLqBsBbsCrFqCZVJgBdUkCY5BAlCyBsCYmCf!y8E4BflBdHrEAFdkBjBgDgBDTRGzBlBiCp" +
  "ETLPOSiBvBDEObYCmBZLGnDrBGGsCdc0BmEiBeyCP8CU!8gFuBBjBVEAxBbsCWuBenB!okEpHrBAzCiClEwFZgCjE0E4CJ-D" +
  "9DoBA4CvCPfkBPWxBwBbLvD!szEqCsBlBvBDL_BlBbPjDFOtBRPYvBQvBPNU7BCF2BlBuBBoCYa8BFIiBiCQ2E4EiD7BrC1C" +
  "elBFR!g-EwKGvBNlBNqBTTCvBvBWCwBZU7BlBHMQiBwBaORgCeBegBRIjB!wlD4HhBJTgBF6BSgCiC7CXzB!lsC0MnBAKaYG" +
  "Gf!g7E8MnBzBXcWwBWCFbeoBDlB!k0E0L1BlB-C4DIfvBxB!s4E8OwBLrBtBD6B!88EmPMrBfKMlBTHT2BYDAQZeyBP!-3Eq" +
  "QLhBlByByBP!03EkXmBAK3BhBtBE_B4CVGxBtBoBLNXY3BCOcLIFNTWF4BQLQiDYA!_xC6W_BLBQiCD!jgDqW5BQ6BGcTbB!" +
  "36C6YqDHiCpBPPtCKdhBlBYzCGEMwCARiBXGgBI!-pEsXhBThBMAiB2CeIPZnB!tiG8XPBEwBqBddP!zjDuc2BJsDlC6BRtE" +
  "RaWpBOViBpEgBOK9DdsD0BmDR!9gD2dhBiBIYa5B!w3EwcRhBZgC4BmCSLd3C!nhDohBrBHDQwBH!ngDohBFbZuBgBR!qoF2" +
  "qBRlBPMffZMWqBmCE!orBysB_BrBdW-CW!0d0sBoDP_BPvBQIQ!sT6vBPhCpDoBEW2DE!wLwzBYbFzBhBLZyCqBK!owFuuBd" +
  "vC5DV3BtBbQAejFboBdZjCZPTOKkBpBoBgE2C8DEoBmCcRyC2BYyBFsBQaqBIW3ClBpBCnB!-L20BLdbiBiBeGhB!8zFm3Bc" +
  "HcSKtB7BJhBnB_BcVrBrBBFoBUgBsBCW2CuC3B!xvCm6BiCDhBT9BgBQMOT!r6E08B1CO_CuBLeoDR6CnC!lmCs_BZjBaOcH" +
  "NN8CNLdcIStBPjBtBGBmBtBhBXAcUlBK3DBSaRKsC4CuCkBdjB!7lFyjCmBCLrBiBfpCwBFeUD!yzFu_BoBlC7BMX5BoBnBB" +
  "bdYZfEoGXoBE2BkBSPUSEoBvE!vIqhClCX5BGiBqBVqB2DyBsBXtB7C!8PwlCXfvBoB6BMOT!n_FsnCnBNZc4BUsBNhBT!3D" +
  "qpCpBrB0CGtBlCoBBoBzBaFkB7ByBHZlBQTjBVrEB7CdVIgD0BpCWqBMVWGa8BDGYbYvBIHoBVTV8BuBqCwCA!_uG8qCpCMo" +
  "CECP!hjD2tCPTbOQQcJ!rmDsuCtBVlBMeS2BH!12G4vC6DThBLvCMHU!tqDiyCGRkG5BjBNzCc_CpBNY1BDiBUSkCeD!jSiz" +
  "CJZuBZzBf1EhBjFSmBS1CUkCUzCIca8BG-BZ-BWyBLiCWiCD!5-C-zCtBBJUSWkCFdhB!36GozCaJHcsDFuCjBpDVAnBPH5D" +
  "aHS1CCVOIOvBJSRVPA-EqGlCBX!x3Ds2CXNtEagCemDpB!ghHy4CxBKyBQAZ!r_G04CzBBAagDJrBN!lxD82CAnB2BewBZLd" +
  "mBZmCgCEsB0DJ0BTETdTcVFTtCb_CG9BlCvBb3BBfRBZvBDvBhBrBrBRtC8BFkBjC4BIsHvCuDFGpCctB8BlBeOWoBTgCdUg" +
  "CUkC4Bd8BvBeuBqBdiDqFGkDzBmCDMzCiCd6BWgCgCgEnEPXyFjCQhBwBVCrBtFrC9HA7FpEiD8BwEmBkBTlBbanC0BTiCGo" +
  "BsBCbaP9G9CdCBiBkCiBrDFIN9DrBXZFbkBb1EbmCAvCHlBnCZWUrBjBvBKeZwBApBXGaNW9CjExC7CxCC3ByB9DNjCdAVat" +
  "ByCDwBtBoBnBRzBevDDPDQjBlBH7BY3CAtD3BdjBI9BbnE-B9DqCtBgDW0BYSkCiEWIbnBnDRKBtCXZ-EEgCdIlBX_DgCzCe" +
  "HsCgBsDlBwBgBGuBYU8BGiCwBYNfbK9CagBNsByBSIemC_BuCE2BVYWgDChBLOR-BVIf-BXatB0BjBgEHqD9BgB7CWFAbdhB" +
  "MLoCFAnBgBa0DlBUXHVwBMoERwDtCgCNiB3CPhCrEhFX_FjCjFpBnBpDP3D9BhBnBPtDjGlHtBVxBE5CmBBVyBhBDbYPBTlB" +
  "zB7BT7DFIpCXN9CAEnBcLWMMTlClBN9BlCTLduClBNjBtBVZtB1BjBoB_BzBC3BXFlB9EgCZwEQmBqBe7BMmBkBOiCsBNWyC" +
  "bMLxBZGuB-EP0CSCkC8FBuEYwBe8JH4BrBoB1FsD1EqJ7BqBMSRmBiC0CJSNTXSAwBiBoCyBaQyB0BwBNKAoDbgBAgB1BalB" +
  "hBUVjBNFYhDaFY1BqBDVVQBuBtCoCGQ1EapE6CpCV1IqDvCiCJUUmBf2B_DyDBiBrBcJc_BsBjB4ChCaGhC6DrEmB9CUBcpB" +
  "XP1CuCDyBtDkCUCQgB1BoBnCsEvBoBzCW3EkHFiDauDfsDgCFUlBJsC3FqCViBGazBQFgBpDuCLiBzBiBVkBlDE_D2BhJ2Br" +
  "BJIZzEhBMgCqBMJKnEtCcTlBbxCd1C3B9H_B8I-Da2BvCTzBa_BPEoBZOzBH9BcAWdS-BiC8BD8CcdacQlFN7BKhCmByEmBg" +
  "BAFT0CApG6CWW6DSyBoB0GoB6CZuNV8IxB0Ce6BF-DccPmBcgDnB2BaEdyDQuJ3B3BT2GEqBXsBUnBQaOwCGoCf0DN4DGDYk" +
  "BI-BNBlBagBgBBSoB3CqBCsBwBc8CX4BrBjBTqCH!1uEs7CTR4CM4BTuBUkCzBUQbqBsCAsBRmBhCqEnBDPhCDaPNNrESlJZ" +
  "VS5CGxBgBmGQ7GIVO-CQjEK-BuBqDYqBH!ziE47CjBZ9BciDB!t_Cs7C9DN3BYWQ8CDkCV!lsDu7CgBXkBgBmDQkCpBFZ2Dc" +
  "uEnBGPqCIqBZgDNqC1BpCT-EhB6BjB-BDLblCtBvD4BzBFFVyDzBanBNd3EsBqDnChGmBxBUOM1DoBxDRhBMae-EGNOiC8BL" +
  "S7EuBYKrDoB9CPxEI1ESfOqBS5BALqBekBwEabZ!t9Dq8C2DDMLlBR8BRFjBnDL_DuBAOyCFrBawBU!wzFw7C1EG4CU-BZ!v" +
  "0D-6CpBdtBCX4B8BcgFLrDrB!x2Eo5CpDTxDmBwCqClBYmJDyCbzEnBxBbAP!u8F89CtBPrESKOwFP!_0D49CVPpDOuCcyBZ" +
  "!s1Fu-Cfd1GHvCaWc2BI6HX!j7D8_CeRPxBhCDrBGCYhCDBgBiFO!nnEo_CQNsCEIRXTrHXhCMyCSrHC8C0B-HpB5BoBkBOq" +
  "BDOT!-nCs4C5ECLSnCKFW4DiClBEgDkBJS8GuB4IccP9M5C7DtCIfuChB!r2DsgD8DLiBNHPmCRiKE0BfzCR3JCpDOTqBnBQ" +
  "_DSOQyCB!nxEihDFddNvFZ1BI2E4B0DG!2lEmgDMR6EI6DhBJTzFtBwEHWZwCQyJfCgB2EHgCTSZXPyDvBmBqBgCRwHEbkB0" +
  "BSqLZqE1ByHAiBPFdyBJ0IGmCjBwBMfaSSyGHsFlBA9EnDPuC_BDbrCIxEhBlElC5BanDdROlBP1BE9B_BCPuBJF5BjBBRfQ" +
  "RlCTNtB5BJLnB5BlB1BwFS2BkBsB-BI0G8DgB4BvBDXflDrBfwBnDLjDjCiBX3ENEc9BGxBT9HD5IrF-BF6BhBaUsBB6BrBC" +
  "hBfnBVvDpC1ClEzDzBXxBU9C1BJpB1CtBFVmBXsBnCNjCnDbP-CeGbiB5BOY6BpBQ_DpBsB8BTWpDjClBBTR2BhBARgBLsBc" +
  "-BPGT3BLtClCsBViCpDAdZJiBhBP_BVDjDvEtDlClCXNO3DtBNpBVBBsB1BMnDtCJbiE1ESpCFnChF5DNaMa_BejB-BlCSGe" +
  "jBAjBlFaBYlCkDtC0BnFdBzC8BzB0E_BuCFXQyE_B8GnCxBtBOE2CZ-BzBkBlB0CjBCJlBvBIFNrCHCdVX5BZxDjDARrCZR9" +
  "GTBRdMNjBJdnBlBmB5D8IjB2G3CRzBwBUOLQrCsBrB8BhGNjFaRwBRInCZ_D2B3B8C1CFiB7C2BnBatCIyBYHHtBQZ4CE-C8" +
  "CU1CsCbqBxBzBpCZHFzBhDzBAPxDhBJfpE_B5DbZX7BBjBmDC-BjCuDnCoCZgDnBY9C2ETAK6BnBpC7B4CkCzEgC3CFhB0Br" +
  "BanEkBXiBzCiFrEXZsCzBkI-BB1B_B5EjCnDrJtIpB1CPnCaNJhC0B5CM9E1BvCxCjBnD3CgB7EVfjDxBORblD_E_E_CvBhE" +
  "E1DlBvBaR-BKmB3D2FlBoGhDiFA6Cc6CuB8BC0BfgCOY1BsE7D-EoBmFPcjBoBnDT9BwCjDD3E5BrDSxDf7BUpEgD_CyElCy" +
  "BD6BjBuBuB4BMuCf4EqCoDamCqCoCkBE2CoCJyBU2BgD-BmBiC4EXwE6B2IOsBQcDAVkBITTObFhBZTIVkG9BShBoEtBmBeE" +
  "yB4BYmJvC0CcmBXKM-BLgBY6B8DGuBNUOO5BGZX9BDfWvCTxCU1B-BUgBZSuBmB8BCSesCD-CkBiCCgErBwCC2BmBJc9FoD-" +
  "BoBXQ6BYlFnBCX-BHHNhDdVIIUrBMuBULKlDUrB9BfFvB7CuB9BvBBxBhBLarBGxBJcVTHxBMcpBPJsBdAVlBKMTXDOjBZAh" +
  "BSV6BjCuCG6BtEoCrBgCZGLRAgBfGfNKzBmD1CgBABPoD3BHN5BaPZcPDTlBjBPDQqBbsBjEiC_ByBLmBzBS9CvBvCK5BLBv" +
  "B5CjBrBjCQV5CzC3CCpBdrBoB_CDC4BbUgBwCZ8C4Bc0HNUYIwClC-B9BQDe4DBNuBmBR-CgBMgB4CaiB8BoEScSb8BSgCyC" +
  "aNhBaRxBnBMhBoBJAN-BSgCbsEsByCPgCeFgCUYkBOgBdgBCO2BnBIDY6FMsBWpBSvGZ9BiBKoBTkBUY6EsCDS3BSjCLnBZG" +
  "ZrEhCd3BkCxBlBtBnBJlBnDxBEVftBBnDkFtCtB1BH3BUZmE-GmDoFkEyFwC4EQ-BiBwEG-DdzBJsBZqBOuFhB2F_BEZtDfv" +
  "GagCdG7ByCVGUZScOgDZiBKbe-CoBqCRYchBYUYdYwDLWVxBFAVgBN-BKKY-G2BeBlBX0GcuBXuBapBWUO2DLoG5BcUpBevB" +
  "EMUVsBqCkBakBoEBIXlBfmBnBJ3BsBX9CzCsBFqDgCXYUarBCJYgBoBzBgBoCaJeqBVPlBqBHRckCQyCCqCVjBiBDqB8HMfU" +
  "uBa0HmBqEFiFWyBiB-CQkCN1BH6CH!s9B0zB0BpBhBBb3BOvBiCd4DECwCfOKcZCIiBqCCpBuBfJDbLiCtBOpB6BoBDAemCA" +
  "AgCpCIzCZ_CnCkBlBDZgCjC!3pEkhDpCL7BO0EKNL!8eqhD3CPlCKaKXM0CIoCX!hpEoiDzDHqBSqCJ!53DyhD5CCVe8DRLN" +
  "!h9D8hDQP9GUoBMvBIDQ6FTgBT!sjE8hDhHPqD6BiEZJP!6W0jDkEdjDPtClCvBB1CakBOpEsBdgBmIQyBN!6fwkDuCN7BVz" +
  "DDzDGtDekKE!-_B2kDtEVrBKWM3CCqIENF!-8D0iDnGG1E0B-FkBqF5BJjB!3sDyjDwBLhEpBlCDzCGpBQgBanCBlCgBgDiB" +
  "RI-CC4FlBgBZ!z1C8nDqIRnHtB2CAjHjCjHT2BDZHgBRtF1BqCPpDXlLKDUqCKTciEN1DgByDoBpCkBsGIlHC_E4B0He8CNg" +
  "BW8DMwNB!7hBsoD6Hd5NV6IPuCMiBNrBXoJe4DHWP5JrB8CBtC3BCrBwBZhENqCVKhBpBD0BhB5CDuBPLNvDFyBZARjDGqDj" +
  "BQfnCHvCoBObtBTgFD3GjChFN_C3B_GxBhBXV1B_BfQfnBnC3BB5BgBvCAnEwDZ-B1BkBOeZOmBuB8BQawBnDZxBMOwB2DJn" +
  "DoBpCEuBmBnD0CzBQAQpDYhJBzDmB6FQlIaGQqJmBQOrDOmHwBPS6GSmFLqDWsHf_CWGSmKkBsOB";

let decoded: readonly OutlineRing[] | null = null;

/**
 * Every ring of coastline, decoded on first use and kept.
 *
 * Lazy because most sessions never open a satellite's card, and eager decoding
 * would spend the work on every launch for a map nobody asked for. Kept because
 * the card is opened again and again, and the second decode would be a hitch
 * on a tap rather than on a launch.
 */
export function worldOutline(): readonly OutlineRing[] {
  if (decoded) return decoded;

  const rings: OutlineRing[] = [];
  for (const chunk of ENCODED.split("!")) {
    const ring: [number, number][] = [];
    let lon = 0;
    let lat = 0;
    let at = 0;
    while (at < chunk.length) {
      let value: number;
      [value, at] = readVarint(chunk, at);
      lon += value;
      [value, at] = readVarint(chunk, at);
      lat += value;
      ring.push([lon / GRID_PER_DEGREE, lat / GRID_PER_DEGREE]);
    }
    rings.push(ring);
  }

  decoded = rings;
  return rings;
}

/** One zig-zag varint from `at`, and where the next one starts. */
function readVarint(chunk: string, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    const code = ALPHABET.indexOf(chunk[at]);
    at += 1;
    value |= (code & 0x1f) << shift;
    if ((code & 0x20) === 0) break;
    shift += 5;
  }
  // Zig-zag: the low bit is the sign, so -1 is 1 and 1 is 2.
  return [value & 1 ? -((value + 1) / 2) : value / 2, at];
}
