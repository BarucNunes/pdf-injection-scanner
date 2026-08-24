# PDF Injection Scanner

## Detector visual

`detectVisualAnomalies(pages)` em `detector-visual.js` retorna objetos com
`categoria`, `pagina`, `trecho` (ate 200 caracteres) e `explicacao`. Ele
identifica `cor-proxima-ao-fundo`, `fonte-menor-que-1pt`,
`fora-da-mediabox` e `texto-coberto`.

Execute `npm.cmd test` para validar o detector. Os tres PDFs em
`test-fixtures/` cobrem, respectivamente: cor igual ao fundo; fonte de 0,5 pt
mais texto alem da MediaBox; e texto coberto por um retangulo. Para recria-los,
use `npm.cmd run generate:fixtures`.

`detectUnicodeAnomalies(pages)` em `detector-unicode.js` procura caracteres de
largura zero, Unicode Tags, controles bidirecionais e sequencias longas de
caracteres invisiveis. Achados de Unicode Tags incluem o ASCII decodificado na
explicacao.

`detector-frases.js` carrega a lista editavel em
`config/frases-suspeitas.json`, ignorando caixa e acentos e aceitando um
pequeno erro em palavras longas. `detector-metadados.js` procura JavaScript,
campos/anotacoes ocultos e texto alternativo de imagens na sintaxe bruta do PDF.

`motor-analise.js` executa todos os detectores, aplica pesos por categoria e
entrega um score de risco de 0 a 100, resumo por severidade e grupos de achados.
O score e exclusivamente uma triagem heuristica: todo achado deve ser revisado
no contexto do documento, pois falsos positivos sao possiveis.

Ferramenta estática e client-side para extração de dados visuais e textuais de PDFs. O projeto ainda não executa detectores de prompt injection.

## Executar

Abra `index.html` em um servidor estático local (por exemplo, `npx serve .`). A integração usa pdf.js 4.4.168 via CDN e precisa de conexão para carregar a biblioteca.

## API de extração

`extractPdfData(file)` em `app.js` recebe um `File` PDF e retorna uma `Promise` com um item por página. Cada página contém o texto agregado e blocos com `text`, `position`, `fontSize`, `fontName` e `color`. O pdf.js não expõe a cor no `TextContent` padrão, portanto `color` é `null` nesta etapa.
