/** Browser PP-OCRv5 (optional). WASM binary must be fetched, not Vite's HTML fallback. */
import { preprocessImage } from './ocr.js';
import { columnsFromPaddle } from '../utils/paddleMapping.js';
let modelPromise;
export async function warmPaddle(){
  if(!modelPromise){
    modelPromise=import('@paddleocr/paddleocr-js')
      .then(({PaddleOCR})=>PaddleOCR.create({
        lang:'ch',ocrVersion:'PP-OCRv5',
        // Prevent ORT from resolving its WASM asset under the Vite app URL.
        // A missing /dist/*.wasm route returned index.html (<!do) in v1.6.
        ortOptions:{
          backend:'wasm',
          wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',
          numThreads:1,
        },
      }))
      .catch(error=>{modelPromise=null;
        throw new Error('PaddleOCR 載入失敗（模型或 WASM 無法下載）。已保留 Tesseract 備援。原始訊息：'+error.message);
      });
  }
  return modelPromise;
}
export async function scanImagePaddle(file,mode='auto',yShift=0,calibration=null){
  const {canvas,boxes,detected,inputKind}=await preprocessImage(file,mode,yShift,calibration,'original');
  const model=await warmPaddle();
  const results=await model.predict(canvas);
  const columns=columnsFromPaddle(results?.[0]?.items,boxes);
  return {columns,raw:columns.map((c,i)=>`#${i+1}: ${c.join(' ')||'(無文字)'}`).join('\n'),
    debugURL:canvas.toDataURL('image/png'),
    layoutInfo:`PP-OCRv5／${inputKind==='names'?'名稱截圖':`名稱列 ${Math.round(detected.titleCenterY*100)}%`}`};
}
