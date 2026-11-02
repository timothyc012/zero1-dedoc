/** (Zero1 포크) 예전 좁은 진입점 — upstream 이 parse() 를 index.ts 에 두므로 같은 함수를 그대로 다시 내보낸다 */
export {
  parse, parseImage, parseHwp3, parseHwpx, parseHwp, parsePdf,
  parseXlsx, parseXls, parseDocx, parsePptx, parseHwpml,
} from "./index.js"
