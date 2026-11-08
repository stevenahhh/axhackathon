import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 서버는 /i/<토큰>/ 경로 아래에서 열리므로 에셋을 상대 경로로 묶는다.
// 시연 사진은 git에 넣지 않으므로 개발 중에는 `DATA_DIR=data-demo PORT=8601 python3 serve.py`가 /drone을 제공한다.
// jspdf는 html()·svg 플러그인용 선택 의존성(html2canvas·canvg·dompurify)을 dynamic import로 부른다.
// PDF 다운로드(src/lib/pdf.ts)는 캔버스 이미지만 넣으므로 셋을 번들에서 빼 dist에 쓰지 않는 조각이 생기지 않게 한다.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { rolldownOptions: { external: ['html2canvas', 'canvg', 'dompurify'] } },
  server: { proxy: { '/api': 'http://127.0.0.1:8601', '/drone': 'http://127.0.0.1:8601' } },
})
