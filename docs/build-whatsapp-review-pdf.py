"""Build the Portuguese review from captured HTTP evidence, without credentials."""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf'
LOCAL = json.loads((OUT / 'get-endpoints-local-evidence.json').read_text(encoding='utf-8'))
TEST = json.loads((OUT / 'get-endpoints-test-evidence.json').read_text(encoding='utf-8'))
CHECKS = json.loads((OUT / 'verification-summary.json').read_text(encoding='utf-8'))
OPENAPI = json.loads((ROOT / 'apps/api/openapi.json').read_text(encoding='utf-8'))
pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='ArialBold', italic='Arial', boldItalic='ArialBold')
NAVY = colors.HexColor('#172c3a')
GREEN = colors.HexColor('#087d65')
PALE = colors.HexColor('#edf5f2')
GRAY = colors.HexColor('#536270')
styles = {
    'title': ParagraphStyle('title', fontName='ArialBold', fontSize=25, leading=30, textColor=NAVY, spaceAfter=15),
    'h1': ParagraphStyle('h1', fontName='ArialBold', fontSize=18, leading=23, textColor=NAVY, spaceAfter=13),
    'h2': ParagraphStyle('h2', fontName='ArialBold', fontSize=11, leading=15, textColor=GREEN, spaceBefore=13, spaceAfter=7),
    'body': ParagraphStyle('body', fontName='Arial', fontSize=10, leading=15, textColor=NAVY, spaceAfter=9),
    'small': ParagraphStyle('small', fontName='Arial', fontSize=8, leading=11, textColor=GRAY, spaceAfter=5),
    'cell': ParagraphStyle('cell', fontName='Arial', fontSize=8, leading=10.5, textColor=NAVY),
    'head': ParagraphStyle('head', fontName='ArialBold', fontSize=8, leading=11, textColor=colors.white),
    'code': ParagraphStyle('code', fontName='Arial', fontSize=8.5, leading=13, textColor=NAVY, backColor=PALE, borderPadding=10, spaceAfter=11),
}
story = []


def p(text, kind='body'):
    return Paragraph(text, styles[kind])


def add(text, kind='body'):
    story.append(p(text, kind))


def table(headers, rows, widths, compact=False):
    data = [[p(escape(str(v)), 'head') for v in headers]]
    data += [[p(escape(str(v)), 'cell') for v in row] for row in rows]
    result = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    result.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PALE]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5 if compact else 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5 if compact else 5),
        ('LINEBELOW', (0, 0), (-1, 0), 0.7, GREEN),
    ]))
    story.append(result)
    story.append(Spacer(1, 10))


def new_page(title):
    story.append(PageBreak())
    add(title, 'h1')


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=-3))).strftime('%d/%m/%Y %H:%M:%S UTC-3')


responses = TEST.get('responses', [])
web_base_url = responses[0].get('baseUrl', 'http://localhost:5175') if responses else 'http://localhost:5175'
local_counts = Counter(r['status'] for r in LOCAL['requests'])
test_counts = Counter(r['status'] for r in responses)
ops = [(m.upper(), path, operation) for path, methods in OPENAPI['paths'].items() for m, operation in methods.items() if m in ('get', 'post', 'put', 'patch', 'delete')]
new_ids = {
    'getPhoneCommerceSettings', 'updatePhoneCommerceSettings', 'getPhoneEncryption', 'setPhoneEncryption',
    'listBlockedUsers', 'blockUsers', 'unblockUsers', 'listPhoneQrCodes', 'createPhoneQrCode',
    'getPhoneQrCode', 'updatePhoneQrCode', 'deletePhoneQrCode', 'sendTypingIndicator',
}
new_ops = [(m, path, op) for m, path, op in ops if op.get('operationId') in new_ids]
if len(new_ops) != 13:
    raise ValueError(f'Expected 13 additions, found {len(new_ops)}; verify OpenAPI identifiers.')

add('REVISÃO DA APLICAÇÃO / WHATSAPP CLOUD API', 'small')
add('Integração e evidências<br/>de consultas GET', 'title')
add('Relatório técnico - 05 de outubro de 2026', 'h2')
add('A aplicação recebeu novas integrações e correções de comportamento. A coleta local confirmou a saúde da API e do banco, mas as consultas privadas exigem login. O token armazenado no banco local é idêntico ao token da fixture de testes; não há validação contra uma conta Meta real nesta rodada.')
table(['API local', 'Operações novas', 'GETs locais', 'Testes unitários'], [[len(ops), len(new_ops), len(LOCAL['requests']), sum(CHECKS['unit'].values())]], [129, 129, 129, 128])
add('Resultado das consultas', 'h2')
table(['Origem', 'Dados', 'Resultado e alcance'], [
    ['Local :3001', f"{len(LOCAL['requests'])} GETs sem sessão", f"{local_counts.get(200, 0)} HTTP 200; {local_counts.get(401, 0)} HTTP 401. Saúde e autenticação verificadas; dados privados não lidos."],
    [f'Teste {web_base_url} / API :3998', f'{len(responses)} respostas GET autenticadas', '; '.join(f'HTTP {s}: {n}' for s, n in sorted(test_counts.items())) + '. API e PostgreSQL reais de teste; Graph simulado em :4011.'],
], [110, 145, 260])
add('Conclusão da revisão', 'h2')
add('A revisão independente do candidato final não encontrou bloqueios materiais por leitura. Os testes listados neste relatório passaram. Esses resultados demonstram comportamento local e contratos exercitados pelo simulador; não demonstram permissões, elegibilidade ou sucesso operacional em produção na Meta.')
add('Fontes de evidência', 'h2')
add('As contagens e amostras provêm dos arquivos JSON de coleta em output/pdf. O inventário de credenciais veio de leitura separada do banco, sem alteração de ativos. Tokens, senhas, cookies e segredos não são incluídos no relatório.', 'small')

new_page('1. Ambiente local e credenciais')
add(f"Base consultada: <b>{escape(LOCAL['baseUrl'])}</b><br/>Coleta: {timestamp(LOCAL['collectedAt'])}<br/>Método: GET para cada uma das 45 operações GET publicadas no OpenAPI.")
add('Resultados públicos obtidos', 'h2')
for row in LOCAL['requests']:
    if row['status'] == 200:
        add(f"<b>{escape(row['urlPath'])}</b> - HTTP 200, {row['durationMs']} ms", 'body')
        add(escape(json.dumps(row['body'], ensure_ascii=False)), 'code')
add('Limite das respostas privadas', 'h2')
add('As outras 42 operações responderam UNAUTHENTICATED / HTTP 401. Isso é uma barreira de autenticação esperada, não uma falha comprovada dos recursos. Não se conclui, a partir de um 401, que a chamada Graph correspondente funciona. IDs existentes foram usados para organização, conexão e telefone; os demais parâmetros usaram sentinelas sintéticas.')
add('Inventário separado do banco', 'h2')
inv = LOCAL['credentialInventory']
table(['Item', 'Observação'], [
    ['Contas e ativos locais', f"{inv['users']} usuário; {inv['organizations']} organização; {inv['phoneCount']} telefones."],
    ['Conexão manual', 'Uma conexão ACTIVE com App ID, token e App Secret armazenados.'],
    ['Classificação do token', 'Igualdade exata com o token declarado na fixture E2E do projeto. Credencial fictícia de teste.'],
    ['Meta real', 'Não houve consulta autenticada bem-sucedida à Meta real. Nenhum estado privado de negócio foi obtido pelas rotas locais nesta coleta.'],
], [137, 378])
add('A porta 3000 corresponde a outra aplicação no computador. Seu conteúdo foi excluído. O alvo deste relatório é a API deste repositório na porta 3001.', 'small')

new_page('2. Integrações e correções entregues')
add('Treze novas operações locais', 'h2')
table(['Método', 'operationId', 'Recurso'], [(m, op['operationId'], 'Digitação' if 'typing' in path else path.rsplit('/', 1)[-1]) for m, path, op in new_ops], [57, 231, 227])
add('As famílias novas são comércio (2), criptografia de Flows (2), bloqueados (3), QR codes (5) e digitação (1). Rotas por telefone usam /organizations/{organizationId}/phone-numbers/{phoneId}; digitação usa a mensagem recebida da própria organização.', 'small')
add('Comportamento corrigido e integração da interface', 'h2')
add('Configurações comerciais preservam false ao atualizar catálogo e carrinho. Criptografia aceita apenas chave pública RSA PEM de 2048 bits. Bloqueio e desbloqueio preservam resultados parciais e atualizam o cache de todas as páginas do telefone. QR codes oferecem criação, leitura, edição e exclusão; a interface usa PNG, consistente com a consulta.')
add('A caixa de entrada envia o indicador de digitação, apresenta erros HTTP/Meta e mantém o rascunho após falhas. Contatos identificados apenas por BSUID recebem indicação de limitação de resposta. No webhook, timestamps não retrocedem com eventos atrasados ou replays; o perfil só é associado quando há identificador presente.')
add('Falha material encontrada no navegador e corrigida: o efeito de rolagem devolvia o retorno de scrollIntoView ao React. No Chromium usado, esse retorno é uma Promise, inadequada como função de limpeza. A atualização da conversa derrubava a tela de mensagens. O efeito agora executa a rolagem sem devolver seu resultado.', 'small')
add('Backend, UI, validação, RBAC, isolamento, auditoria, OpenAPI e cliente gerado estão conectados. Corrigido também o GET de analytics: listas de IDs separadas por vírgula são aceitas, com validação UUID e limite de dez itens. Inventário: docs/whatsapp-endpoint-coverage.md.', 'small')
add('Cobertura da plataforma', 'h2')
add('As 108 operações pertencem à API local. Calling, grupos, pagamentos, automação conversacional e envio por BSUID não estão implementados. A cobertura não é universal da plataforma Meta.')

new_page('3. Verificação e GETs autenticados de teste')
add('Verificação do candidato final', 'h2')
table(['Verificação', 'Resultado'], CHECKS['checks'], [310, 205])
add('Ambiente e procedência', 'h2')
add('Os projetos de integração e HTTP E2E compartilham um banco dedicado cujo setup limpa tabelas. O script test:e2e foi ajustado para executar esses projetos em sequência, evitando limpeza concorrente durante os testes.', 'small')
add(f'A sessão foi criada pelo fluxo normal da aplicação no banco dedicado de testes. O navegador usa {escape(web_base_url)}, com proxy para API :3998. O Graph está em http://localhost:4011 e usa dados fictícios. GETs coletados durante os testes podem conter mudanças realizadas pelos próprios cenários E2E. A porta alternativa 5175 evitou interferir em outro servidor existente em 5174.')
unique = defaultdict(list)
for row in responses:
    unique[row.get('operationId') or 'Não mapeado'].append(row)
new_page('GETs autenticados - inventário de teste')
add(f"Foram capturadas {len(responses)} respostas GET, abrangendo {len([key for key in unique if key != 'Não mapeado'])} operationIds distintos. Chamadas repetidas representam refetch, paginação ou navegação. Durações ausentes não foram estimadas.")
rows = []
for name, records in sorted(unique.items()):
    statuses = ', '.join(str(s) for s in sorted({r['status'] for r in records}))
    measured = [r['durationMs'] for r in records if isinstance(r.get('durationMs'), (int, float))]
    rows.append((name, len(records), statuses, f'{min(measured):.0f}-{max(measured):.0f}' if measured else 'n/d'))
table(['operationId', 'GETs', 'HTTP', 'ms min-max'], rows, [290, 55, 75, 95])
add('Esses dados demonstram a integração autenticada com o simulador. Respostas 200 deste ambiente não são respostas da Meta real. Corpo null indica conteúdo não disponível na coleta; a navegação pode cancelar uma leitura pendente.', 'small')

new_page('4. Dados retornados no ambiente simulado')
samples = ['getPhoneCommerceSettings', 'getPhoneEncryption', 'listBlockedUsers', 'listPhoneQrCodes', 'getPhoneQrCode', 'getDashboard']
for name in samples:
    matching = [r for r in responses if r.get('operationId') == name and r['status'] == 200]
    if not matching:
        continue
    row = matching[-1]
    if name == 'getPhoneEncryption':
        configured = [r for r in matching if isinstance(r.get('body'), dict) and r['body'].get('signatureStatus')]
        row = configured[-1] if configured else row
    body = row.get('body')
    if name == 'getDashboard' and isinstance(body, dict):
        body = {k: body.get(k) for k in ['accounts', 'templates', 'messages', 'webhook']}
    if name == 'listBlockedUsers' and isinstance(body, dict):
        items = body.get('items', [])
        body = {'itensRetornadosNaPagina': len(items), 'amostraDeTresItens': items[:3], 'nextCursor': body.get('nextCursor')}
    if isinstance(body, dict) and body.get('qrImageUrl'):
        body = {**body, 'qrImageUrl': '[imagem de teste; URL completa na evidência JSON]'}
    rendered = json.dumps(body, ensure_ascii=False, indent=2)
    if len(rendered) > 1300:
        rendered = rendered[:1300] + '\n[amostra limitada; resposta sanitizada no JSON]'
    story.append(KeepTogether([p(name, 'h2'), p(escape(rendered).replace('\n', '<br/>').replace('  ', '&nbsp;&nbsp;'), 'code')]))
add('Amostras selecionadas de respostas 200 por recurso; criptografia mostra uma resposta com status configurado. Bloqueados exibe três itens e a contagem da página; dashboard exibe grupos selecionados. Campos sensíveis são redigidos. Listas podem estar vazias após exclusão/desbloqueio no teste. Sequência completa: JSON de evidência.', 'small')

new_page('5. Inventário dos GETs locais')
add('Todas as 45 operações GET do OpenAPI foram chamadas sem cookies de sessão. As rotas abaixo são templates de contrato; os URLs efetivamente chamados e os corpos recebidos estão na evidência JSON.', 'small')
table(['operationId', 'HTTP', 'ms'], [(r['operationId'], r['status'], r['durationMs']) for r in LOCAL['requests']], [365, 65, 85], compact=True)

new_page('6. Limites, fontes e continuidade')
add('O que permanece sem validação real', 'h2')
add('É necessário substituir a credencial fictícia por uma credencial Meta válida, autenticar uma sessão normal da aplicação e repetir as consultas dos recursos elegíveis. Recursos como criptografia, bloqueios e QR codes dependem do número, da conta e das permissões concedidas. Regras de escopo usadas pelo backend ainda precisam de aceitação operacional com a conta real.')
add('Os testes E2E exercitaram mutações somente no ambiente dedicado com Graph simulado. Nenhuma publicação, deploy, envio a clientes reais ou mutação de ativos reais foi realizado como parte da coleta GET.')
add('Reprodução e evidências', 'h2')
add('output/pdf/get-endpoints-local-evidence.json - horários, templates, URLs, HTTP, durações e corpos da coleta local.<br/>output/pdf/get-endpoints-test-evidence.json - respostas autenticadas de teste sanitizadas.<br/>output/pdf/verification-summary.json - verificações do candidato.<br/>apps/api/scripts/audit-local-get.cjs - coleta local somente leitura; executar após build da API.<br/>docs/build-whatsapp-review-pdf.py - regeneração deste relatório.', 'small')
add('Fontes do contrato', 'h2')
add('1. apps/api/openapi.json: fonte local das 108 operações HTTP e 45 GETs.<br/>2. docs/whatsapp-endpoint-coverage.md: mapa de rotas e entradas da interface.<br/>3. README.md: configuração, segurança e limitações da aplicação.', 'small')
add('<a href="https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api">4. Coleção oficial WhatsApp Cloud API da Meta no Postman</a>: contratos externos consultados para comércio, criptografia, bloqueados, QR codes e digitação. Pesquisa anterior desta revisão; referências e detalhes constam no inventário do repositório.', 'small')
add('Decisões e estado de entrega', 'h2')
add('A integração preserva a arquitetura existente e o cliente gerado. O repositório estava sem arquivos rastreados/commits; não foi criado commit ou publicação. Semantica não estava disponível: memória durável não foi registrada nessa ferramenta. Evidências e decisões estão documentadas nos artefatos locais.')


def footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(GREEN)
    canvas.rect(40, h - 31, w - 80, 3, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor('#d6e0e5'))
    canvas.line(40, 35, w - 40, 35)
    canvas.setFont('Arial', 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(40, 23, 'WhatsApp API | Revisão técnica | Dados reais e simulados separados')
    canvas.drawRightString(w - 40, 23, str(doc.page))
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUT / 'relatorio-whatsapp-api.pdf'), pagesize=A4, leftMargin=40, rightMargin=40, topMargin=49, bottomMargin=49, title='Revisão e GETs - WhatsApp API', author='Revisão técnica da aplicação')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT / 'relatorio-whatsapp-api.pdf')
