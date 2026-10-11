# Cobertura de endpoints da aplicação

Inventário gerado a partir de `apps/api/openapi.json` (108 operações HTTP em 2026-10-04). Cada linha descreve uma rota **local** da aplicação. A coluna de UI identifica a área correspondente em `apps/www/src/features`; ela não garante que todos os botões ou estados estejam acessíveis em toda configuração de conta. `★` marca as 13 operações incorporadas nesta rodada.

Referência externa para os contratos Graph usados pelo backend: [coleção oficial WhatsApp Cloud API da Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-06605a2c-2b74-4d0a-a035-2c227eae61d1). A coleção descreve chamadas à Meta; o inventário abaixo é da API local e inclui também autenticação, persistência, auditoria e UX, que não são endpoints da Meta.

## Inventário

### Health

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/health` | `getHealth` | Operação / saúde |
| GET | `/health/ready` | `getReadiness` | Operação / saúde |

### API logs

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/api-logs` | `listApiLogs` | Desenvolvedores / logs |
| GET | `/organizations/{organizationId}/api-logs/{logId}` | `getApiLog` | Desenvolvedores / logs |

### Audit

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/audit-logs` | `listAuditLogs` | Desenvolvedores / auditoria |

### Auth

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/auth/config` | `getAuthConfig` | Autenticação |
| POST | `/auth/register` | `register` | Autenticação |
| POST | `/auth/login` | `login` | Autenticação |
| POST | `/auth/refresh` | `refreshSession` | Autenticação |
| POST | `/auth/logout` | `logout` | Autenticação |
| GET | `/auth/me` | `getMe` | Autenticação |

### Organizations

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations` | `listOrganizations` | Organização / ajustes |
| POST | `/organizations` | `createOrganization` | Organização / ajustes |
| POST | `/organizations/invitations/accept` | `acceptInvitation` | Organização / membros |
| GET | `/organizations/{organizationId}` | `getOrganization` | Organização / ajustes |
| PATCH | `/organizations/{organizationId}` | `updateOrganization` | Organização / ajustes |
| DELETE | `/organizations/{organizationId}` | `deleteOrganization` | Organização / ajustes |
| GET | `/organizations/{organizationId}/members` | `listMembers` | Organização / membros |
| PATCH | `/organizations/{organizationId}/members/{memberId}` | `updateMember` | Organização / membros |
| DELETE | `/organizations/{organizationId}/members/{memberId}` | `removeMember` | Organização / membros |
| GET | `/organizations/{organizationId}/invitations` | `listInvitations` | Organização / membros |
| POST | `/organizations/{organizationId}/invitations` | `createInvitation` | Organização / membros |
| DELETE | `/organizations/{organizationId}/invitations/{invitationId}` | `revokeInvitation` | Organização / membros |

### Meta connections

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/meta/config` | `getMetaConfig` | Conexões / onboarding |
| GET | `/organizations/{organizationId}/capabilities` | `getCapabilities` | Desenvolvedores / diagnósticos |
| GET | `/organizations/{organizationId}/connections` | `listConnections` | Conexões / onboarding |
| GET | `/organizations/{organizationId}/connections/{connectionId}` | `getConnection` | Conexões / onboarding |
| DELETE | `/organizations/{organizationId}/connections/{connectionId}` | `deleteConnection` | Conexões / onboarding |
| POST | `/organizations/{organizationId}/connections/embedded-signup` | `connectEmbeddedSignup` | Conexões / onboarding |
| POST | `/organizations/{organizationId}/connections/manual` | `connectManual` | Conexões / onboarding |
| POST | `/organizations/{organizationId}/connections/{connectionId}/sync` | `syncConnection` | Conexões / onboarding |
| POST | `/organizations/{organizationId}/connections/{connectionId}/diagnostics` | `runDiagnostics` | Desenvolvedores / diagnósticos |
| PATCH | `/organizations/{organizationId}/connections/{connectionId}/credentials` | `rotateCredentials` | Conexões / onboarding |
| POST | `/organizations/{organizationId}/connections/{connectionId}/webhook/reveal-verify-token` | `revealVerifyToken` | Conexões / onboarding |

### WhatsApp Business Accounts

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/wabas` | `listWabas` | Contas / detalhe WABA |
| GET | `/organizations/{organizationId}/wabas/{wabaId}` | `getWaba` | Contas / detalhe WABA |
| PATCH | `/organizations/{organizationId}/wabas/{wabaId}` | `updateWaba` | Contas / detalhe WABA |
| POST | `/organizations/{organizationId}/wabas/{wabaId}/sync` | `syncWaba` | Contas / detalhe WABA |
| POST | `/organizations/{organizationId}/wabas/{wabaId}/subscription` | `subscribeWaba` | Contas / detalhe WABA |
| DELETE | `/organizations/{organizationId}/wabas/{wabaId}/subscription` | `unsubscribeWaba` | Contas / detalhe WABA |

### Phone numbers

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/phone-numbers` | `listPhoneNumbers` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers` | `addPhoneNumber` | Telefones / detalhe |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}` | `getPhoneNumber` | Telefones / detalhe |
| PATCH | `/organizations/{organizationId}/phone-numbers/{phoneId}` | `updatePhoneNumber` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/sync` | `syncPhoneNumber` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/request-code` | `requestVerificationCode` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/verify-code` | `verifyCode` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/register` | `registerPhoneNumber` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/deregister` | `deregisterPhoneNumber` | Telefones / detalhe |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/two-step-pin` | `setTwoStepPin` | Telefones / detalhe |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}/business-profile` | `getBusinessProfile` | Telefone / perfil |
| PATCH | `/organizations/{organizationId}/phone-numbers/{phoneId}/business-profile` | `updateBusinessProfile` | Telefone / perfil |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/business-profile/photo` | `uploadProfilePhoto` | Telefone / perfil |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}/commerce-settings` | `getPhoneCommerceSettings` ★ | Telefone / configurações |
| PATCH | `/organizations/{organizationId}/phone-numbers/{phoneId}/commerce-settings` | `updatePhoneCommerceSettings` ★ | Telefone / configurações |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}/encryption` | `getPhoneEncryption` ★ | Telefone / configurações |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/encryption` | `setPhoneEncryption` ★ | Telefone / configurações |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}/blocked-users` | `listBlockedUsers` ★ | Telefone / configurações |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/blocked-users` | `blockUsers` ★ | Telefone / configurações |
| DELETE | `/organizations/{organizationId}/phone-numbers/{phoneId}/blocked-users` | `unblockUsers` ★ | Telefone / configurações |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}/qr-codes` | `listPhoneQrCodes` ★ | Telefone / QR codes |
| POST | `/organizations/{organizationId}/phone-numbers/{phoneId}/qr-codes` | `createPhoneQrCode` ★ | Telefone / QR codes |
| GET | `/organizations/{organizationId}/phone-numbers/{phoneId}/qr-codes/{code}` | `getPhoneQrCode` ★ | Telefone / QR codes |
| PATCH | `/organizations/{organizationId}/phone-numbers/{phoneId}/qr-codes/{code}` | `updatePhoneQrCode` ★ | Telefone / QR codes |
| DELETE | `/organizations/{organizationId}/phone-numbers/{phoneId}/qr-codes/{code}` | `deletePhoneQrCode` ★ | Telefone / QR codes |

### Message templates

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/templates` | `listTemplates` | Templates / lista, edição e detalhe |
| POST | `/organizations/{organizationId}/templates` | `createTemplate` | Templates / lista, edição e detalhe |
| GET | `/organizations/{organizationId}/templates/facets` | `getTemplateFacets` | Templates / lista, edição e detalhe |
| POST | `/organizations/{organizationId}/templates/sync` | `syncTemplates` | Templates / lista, edição e detalhe |
| POST | `/organizations/{organizationId}/templates/header-samples/{wabaId}` | `uploadTemplateHeaderSample` | Templates / lista, edição e detalhe |
| GET | `/organizations/{organizationId}/templates/{templateId}` | `getTemplate` | Templates / lista, edição e detalhe |
| DELETE | `/organizations/{organizationId}/templates/{templateId}` | `deleteTemplate` | Templates / lista, edição e detalhe |
| POST | `/organizations/{organizationId}/templates/{templateId}/refresh` | `refreshTemplate` | Templates / lista, edição e detalhe |
| POST | `/organizations/{organizationId}/templates/{templateId}/edit` | `editTemplate` | Templates / lista, edição e detalhe |

### Messages

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| POST | `/organizations/{organizationId}/messages` | `sendMessage` | Mensagens / playground ou inbox |
| GET | `/organizations/{organizationId}/messages` | `listMessages` | Mensagens / playground ou inbox |
| GET | `/organizations/{organizationId}/messages/{messageId}` | `getMessage` | Mensagens / playground ou inbox |
| POST | `/organizations/{organizationId}/messages/{messageId}/read` | `markMessageRead` | Inbox / conversa |
| POST | `/organizations/{organizationId}/messages/{messageId}/typing` | `sendTypingIndicator` ★ | Inbox / conversa |
| GET | `/organizations/{organizationId}/conversations` | `listConversations` | Inbox / conversas |
| GET | `/organizations/{organizationId}/conversations/{contactId}` | `getConversation` | Inbox / conversas |
| GET | `/organizations/{organizationId}/conversations/{contactId}/messages` | `listConversationMessages` | Inbox / conversas |

### Media

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/media` | `listMedia` | Mídia / biblioteca |
| POST | `/organizations/{organizationId}/media` | `uploadMedia` | Mídia / biblioteca |
| POST | `/organizations/{organizationId}/media/{mediaId}/refresh` | `refreshMedia` | Mídia / biblioteca |
| GET | `/organizations/{organizationId}/media/{mediaId}/download` | `downloadMedia` | Mídia / biblioteca |
| DELETE | `/organizations/{organizationId}/media/{mediaId}` | `deleteMedia` | Mídia / biblioteca |

### Flows

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/flows` | `listFlows` | Flows / lista ou editor |
| POST | `/organizations/{organizationId}/flows` | `createFlow` | Flows / lista ou editor |
| POST | `/organizations/{organizationId}/flows/sync` | `syncFlows` | Flows / lista ou editor |
| GET | `/organizations/{organizationId}/flows/{flowId}` | `getFlow` | Flows / lista ou editor |
| PATCH | `/organizations/{organizationId}/flows/{flowId}` | `updateFlow` | Flows / lista ou editor |
| DELETE | `/organizations/{organizationId}/flows/{flowId}` | `deleteFlow` | Flows / lista ou editor |
| POST | `/organizations/{organizationId}/flows/{flowId}/refresh` | `refreshFlow` | Flows / lista ou editor |
| PUT | `/organizations/{organizationId}/flows/{flowId}/json` | `updateFlowJson` | Flows / lista ou editor |
| POST | `/organizations/{organizationId}/flows/{flowId}/publish` | `publishFlow` | Flows / lista ou editor |
| POST | `/organizations/{organizationId}/flows/{flowId}/deprecate` | `deprecateFlow` | Flows / lista ou editor |
| GET | `/organizations/{organizationId}/flows/{flowId}/preview` | `getFlowPreview` | Flows / lista ou editor |

### Webhooks

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/webhooks/overview` | `getWebhookOverview` | Desenvolvedores / webhooks e eventos |
| POST | `/organizations/{organizationId}/webhooks/diagnostics` | `runWebhookDiagnostics` | Desenvolvedores / webhooks e eventos |
| GET | `/organizations/{organizationId}/webhook-events` | `listWebhookEvents` | Desenvolvedores / webhooks e eventos |
| GET | `/organizations/{organizationId}/webhook-events/facets` | `getWebhookEventFacets` | Desenvolvedores / webhooks e eventos |
| GET | `/organizations/{organizationId}/webhook-events/{eventId}` | `getWebhookEvent` | Desenvolvedores / webhooks e eventos |
| POST | `/organizations/{organizationId}/webhook-events/{eventId}/replay` | `replayWebhookEvent` | Desenvolvedores / webhooks e eventos |

### Analytics

| Método | Rota local | operationId | Área da UI |
| --- | --- | --- | --- |
| GET | `/organizations/{organizationId}/dashboard` | `getDashboard` | Dashboard / analytics |
| GET | `/organizations/{organizationId}/analytics/meta` | `getMetaAnalytics` | Dashboard / analytics |
| GET | `/organizations/{organizationId}/analytics/templates` | `getTemplateAnalytics` | Dashboard / analytics |
| POST | `/organizations/{organizationId}/analytics/templates/enable` | `enableTemplateInsights` | Dashboard / analytics |

## Escopo e limites verificados

- As 13 operações marcadas cobrem commerce settings (2), encryption (2), blocked users (3), QR codes (5) e typing indicator (1). Todas exigem contexto de organização e telefone; o backend valida os escopos configurados antes da chamada. A aceitação operacional desses escopos precisa ser confirmada com uma conta Meta real.
- O envio de mensagens é uma operação local com tipos aceitos pelo DTO e encaminhados à Cloud API. O inventário não afirma suporte a todos os formatos ou recursos de mensagens disponíveis na plataforma. Typing/read só delega mensagem recebida da própria organização.
- A lista de QR codes usa coleta limitada a 2.000 itens e informa erro se a Meta indicar truncamento. O lote local de bloqueio/desbloqueio aceita de 1 a 100 números por requisição; **100 é limite local da aplicação**, não um limite atribuído à Meta. Resultados parciais são expostos.
- Calling, grupos, pagamentos e conversational commerce além das configurações de catálogo/carrinho listadas acima não têm contrato implementado neste inventário. BSUID e funcionalidades dependentes dele ainda não têm contrato de integração confirmado aqui. A existência de exemplos na coleção oficial não equivale a suporte na aplicação.
- A operação só pode ser exercitada contra a Meta com WABA, número, token, escopos e recursos habilitados para a conta. Os testes automatizados dessas integrações usam mocks ou banco local; não substituem validação com uma conta Meta habilitada.

## Verificação final em 2026-10-05

- Testes aprovados: API unitários 61, interface 8, tipos compartilhados 11, integração PostgreSQL 8, HTTP E2E 15 e navegador 12. Typecheck, build da API, geração OpenAPI/SDK e Biome também passaram.
- O efeito de rolagem da inbox não retorna mais a Promise de `scrollIntoView` como cleanup do React. A consulta de analytics aceita os UUIDs separados por vírgula emitidos pelo cliente gerado, preservando validação e limite de dez IDs.
- O comando `apps/api` `test:e2e` executa integração e HTTP E2E em sequência: ambos compartilham setup que limpa o banco dedicado de testes.
- GETs locais sem sessão, na API `http://localhost:3001`: 45 chamadas, com 3 respostas 200 e 42 respostas 401. Esses 401 confirmam apenas a barreira de autenticação.
- O token local armazenado é igual à fixture fictícia dos testes. Não houve aceitação contra a Meta real.
- O relatório em `output/pdf/relatorio-whatsapp-api.pdf` e os JSONs de evidência nesse diretório separam consultas locais e consultas autenticadas contra Graph simulado.
- Para reproduzir o navegador com a porta 5174 já ocupada, use `pnpm --filter @wacc/www exec playwright test --config e2e/playwright-isolated.config.ts`: web 5175, API 3998 e Graph falso 4011. O banco usado deve terminar em `_test`.
