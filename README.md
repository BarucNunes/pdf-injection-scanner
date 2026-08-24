# PDF Injection Scanner

Ferramenta estática e client-side para extração de dados visuais e textuais de PDFs. O projeto ainda não executa detectores de prompt injection.

## Executar

Abra `index.html` em um servidor estático local (por exemplo, `npx serve .`). A integração usa pdf.js 4.4.168 via CDN e precisa de conexão para carregar a biblioteca.

## API de extração

`extractPdfData(file)` em `app.js` recebe um `File` PDF e retorna uma `Promise` com um item por página. Cada página contém o texto agregado e blocos com `text`, `position`, `fontSize`, `fontName` e `color`. O pdf.js não expõe a cor no `TextContent` padrão, portanto `color` é `null` nesta etapa.
