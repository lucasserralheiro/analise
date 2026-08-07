# Formulários de avaliação criados pelo super admin

Data: 2026-08-07

## Problema

Hoje, avaliar uma empresa usa um modelo rígido: cada área tem **um único questionário fixo** ("Meu Questionário", editado pelo próprio admin de área), reaproveitado pra qualquer empresa. O super admin só escolhe quais áreas estão "envolvidas" numa empresa (`company_areas`) — não escolhe pessoas específicas, não escreve perguntas por avaliação, e não há noção de obrigatoriedade rastreada por pessoa.

O super admin precisa poder **montar um formulário do zero** (perguntas de vários tipos, como um Microsoft Forms) pra uma empresa específica, escolher exatamente quem recebe (departamentos inteiros e/ou pessoas específicas), e acompanhar quem já respondeu — obrigatório todo destinatário responder.

## Objetivo

Super admin cria um form por empresa (pode haver vários forms/rodadas por empresa ao longo do tempo), escolhe destinatários (áreas e/ou pessoas), envia, e acompanha quem respondeu. Isso **substitui** o modelo de questionário fixo por área como forma de avaliar empresas daqui pra frente.

## Não-objetivos

- Não hospedar múltiplos tipos de organização/hierarquia além de área/pessoa — os únicos agrupadores de destinatário são "área" e "pessoa individual".
- Não implementar envio de email (não existe infraestrutura de email no projeto hoje). Obrigatoriedade = rastreada e visível, sem notificação externa, sem bloqueio de outras telas.
- Não versionar/editar perguntas depois que o form é enviado (evita respostas desalinhadas com perguntas alteradas). Dá pra editar destinatários a qualquer momento.
- Não implementar lógica condicional entre perguntas (pular pergunta B se resposta de A for X) — fora de escopo, YAGNI.
- Não apagar dados do modelo antigo (`evaluations`, `evaluation_answers`, `area_questions`, `ai_area_analyses`, `ai_overall_analyses`) — ficam no banco como histórico, sem UI de criação nova.

## Modelo de dados (tabelas novas)

```sql
CREATE TABLE company_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'sent'
  created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)

CREATE TABLE form_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'score_0_10' | 'short_text' | 'long_text' | 'multiple_choice' | 'yes_no'
  text TEXT NOT NULL,
  options TEXT[], -- só usado quando type = 'multiple_choice'
  allow_multiple BOOLEAN NOT NULL DEFAULT false, -- só relevante quando type = 'multiple_choice'
  required BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0
)

CREATE TABLE form_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  UNIQUE (form_id, admin_user_id)
)

CREATE TABLE form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'completed'
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (form_id, admin_user_id)
)

CREATE TABLE form_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES form_questions(id) ON DELETE CASCADE,
  score INTEGER, -- type = 'score_0_10'
  text_value TEXT, -- type = 'short_text' | 'long_text'
  selected_options TEXT[], -- type = 'multiple_choice'
  yes_no BOOLEAN, -- type = 'yes_no'
  UNIQUE (response_id, question_id)
)

CREATE TABLE form_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES company_forms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
```

`form_recipients` já vem "achatado": quando o super admin marca um departamento (área) inteiro no construtor, o backend expande pra uma linha por `admin_user_id` daquela área no momento do envio — não existe uma referência viva a "área" depois de criado, então tirar alguém da área depois não afeta forms já enviados (snapshot no momento da criação/edição, consistente com "editar destinatários a qualquer momento" ser uma ação explícita).

## Navegação e telas

### Dentro da empresa (`app/admin/companies/[id]/`)

- A aba **Resultados** vira **Formulários** (`/admin/companies/:id/forms`): lista os forms da empresa (mais recente primeiro), cada um mostrando título, status (rascunho/enviado), e progresso "X de Y responderam" quando enviado. Botão **"Criar Formulário"** (só `super_admin`).
- Clicar num form abre `/admin/companies/:id/forms/:formId`:
  - Se `draft`: construtor, visível só pra `super_admin` (editar título, perguntas, destinatários; botão "Enviar"); qualquer outro admin recebe 403.
  - Se `sent`: visão de acompanhamento, visível pra `super_admin` **e** qualquer destinatário do form (mesma transparência que a aba Resultados já tinha entre áreas) — lista de destinatários com status (Respondido/Pendente), bloco de parecer de IA (botão "Gerar parecer" pra `super_admin` ou qualquer destinatário). O botão "Editar destinatários" só aparece pra `super_admin`.
- A aba fixa **Avaliar** é removida do layout da empresa (`app/admin/companies/[id]/layout.tsx`) — não faz mais sentido como aba fixa (uma pessoa pode ter forms pendentes de várias empresas ao mesmo tempo). Responder um form específico acontece em `/admin/companies/:id/forms/:formId/respond`.
- A **Visão Geral** (`app/admin/companies/[id]/page.tsx`) troca a seção "Áreas" (que fizemos na sessão anterior, baseada no modelo antigo) por uma lista compacta dos forms da empresa com barra de progresso — mesmo conteúdo da aba Formulários, resumido (até 3 forms mais recentes + "Ver todos os formulários →").

### Fora da empresa

- `app/admin/page.tsx` (Dashboard raiz): novo bloco no topo, **"Formulários pendentes pra você"** — lista de forms (de qualquer empresa) onde o usuário logado é destinatário e ainda não completou a resposta. Cada item linka direto pra `/admin/companies/:id/forms/:formId/respond`. Vazio = bloco não aparece. (O resto da página — o wizard "Comece Agora" com Participantes/Questionários — já está quebrado hoje, aponta pra APIs que não existem [`/api/participants`, `/api/questionnaires`, `/api/evaluations`]; fora de escopo consertar aqui, só não mexo nele.)
- `app/admin/dashboard/page.tsx` + `app/api/dashboard/route.ts` ("Painel de Acompanhamento", só `super_admin`): passa a agrupar por empresa → form (em vez de empresa → área), mostrando título do form, status, e "X de Y responderam" por form.
- **Removido do menu** (`app/admin/layout.tsx`): item "Meu Questionário". A página `app/admin/my-questionnaire/page.tsx` e a rota `app/api/areas/[id]/questions/*` ficam sem link de acesso (código morto controlado — não removo os arquivos agora pra não quebrar histórico de quem tinha link salvo, mas isso é opcional; ver Tarefas do plano).

## Construtor de formulário (super admin)

Tela em `/admin/companies/:id/forms/:formId` quando `status = 'draft'`:

1. **Título** — campo de texto simples.
2. **Perguntas** — lista de cards (mesmo padrão visual do "Meu Questionário" atual: card branco, texto grande, botão de remover no hover). Cada card tem:
   - Seletor de tipo: Nota (0-10) / Texto curto / Texto longo / Múltipla escolha / Sim ou Não.
   - Texto da pergunta.
   - Se `multiple_choice`: lista de opções (adicionar/remover) + toggle "permitir mais de uma resposta".
   - Toggle **"Obrigatória"** (default ligado).
   - Sem drag-and-drop pra reordenar (YAGNI; adiciona complexidade de UI sem necessidade clara agora) — a ordem é a ordem de criação (`order_index` incremental); pra mudar a ordem, apaga e recria a pergunta na posição certa.
3. **Destinatários** — dois seletores lado a lado:
   - **Departamentos**: checklist de áreas (`GET /api/areas`); marcar uma área adiciona à lista de destinatários todos os `admin_users` com `role = 'area_admin' AND area_id = <área>` no momento em que a caixa é marcada (snapshot, não vínculo vivo — mudar quem é admin da área depois não altera destinatários já adicionados).
   - **Pessoas específicas**: busca por nome/email entre todos os `admin_users` (qualquer role), adiciona individualmente.
   - Lista consolidada de destinatários abaixo, com botão de remover por pessoa, sem duplicar quem já foi incluído pelos dois caminhos.
4. Botões **"Salvar rascunho"** (PUT, mantém `status = 'draft'`) e **"Enviar"** (PUT com `status = 'sent'`, grava `sent_at`; exige ≥1 pergunta e ≥1 destinatário; a partir daqui perguntas ficam bloqueadas pra edição — o construtor de perguntas some, resta só gerenciar destinatários).

## Responder um formulário

Tela em `/admin/companies/:id/forms/:formId/respond`, acessível a quem está em `form_recipients` daquele form (403 pra quem não está, e pra forms `draft`).

- Renderiza cada pergunta pelo tipo: nota 0-10 (mesmos botões de hoje), texto curto (input), texto longo (textarea), múltipla escolha (checkboxes se `allow_multiple`, senão radio), sim/não (dois botões toggle).
- **"Salvar progresso"**: grava respostas parciais, `form_responses.status` continua `in_progress`.
- **"Enviar respostas"**: só habilitado quando toda pergunta `required` está respondida; grava `status = 'completed'` e `completed_at = NOW()`.
- Depois de completo, a tela mostra as respostas em modo leitura (sem botão de reenviar — mantém simples, sem edição pós-envio, mesma regra de "Enviar avaliação" que já existe hoje pro modelo antigo).

## Parecer de IA (adaptado)

Um único nível por form (sem mais distinção "por área" / "geral"): botão **"Gerar parecer"** na tela de acompanhamento do form (visível quando `status = 'sent'`), habilitado pra `super_admin` ou qualquer `admin_user_id` presente em `form_recipients`.

- Lê todas as `form_responses` completas do form + suas `form_answers`, formata como texto (pergunta + resposta, agrupado por pessoa — mesmo estilo do prompt atual), mais os documentos da empresa (reaproveita `fetchReadableDocuments`, sem mudança).
- Grava em `form_analyses`. Exibido na tela de acompanhamento do form (conteúdo + quem gerou + quando), com botão "Regerar".
- Erro amigável se nenhuma resposta completa existir ainda ("Nenhuma resposta concluída ainda — aguarde os destinatários responderem antes de gerar o parecer.").

## Tratamento de erros / estados vazios

- Form sem nenhuma pergunta ou destinatário: botão "Enviar" desabilitado com tooltip/texto explicando o motivo.
- Empresa sem nenhum form ainda: estado vazio na aba Formulários ("Nenhum formulário criado ainda" + botão criar, só super admin vê o botão).
- `/respond` pra quem não é destinatário ou form ainda `draft`: 403 com mensagem clara, tela renderiza aviso em vez de crashar.
- Dashboard "Formulários pendentes": se a chamada falhar, bloco simplesmente não aparece (mesmo padrão silencioso já usado no resto do app — SWR sem popular `data`).

## Escopo do plano de implementação

Esse projeto é maior que o de navegação da sessão anterior, mas as peças são **sequenciais** (schema → construtor → resposta → acompanhamento/painel → parecer de IA → remoção dos pontos de acesso antigos), não subsistemas independentes — então continua sendo um plano só, só que mais longo. A ordem de implementação natural:

1. Migrations (tabelas novas em `app/api/migrate/route.ts`, seguindo o padrão `CREATE TABLE IF NOT EXISTS` já usado).
2. APIs de CRUD do form (criar, listar, detalhar, editar perguntas, editar destinatários, enviar).
3. Construtor (UI).
4. API + UI de resposta (`/respond`).
5. Lista de pendentes (API + bloco no Dashboard raiz).
6. Tela de acompanhamento do form (lista de destinatários + status) — reaproveita como a Visão Geral resume forms.
7. Visão Geral e aba Formulários da empresa.
8. Parecer de IA adaptado (API + UI).
9. Painel de Acompanhamento (`/admin/dashboard` + `/api/dashboard`) adaptado.
10. Remoção dos pontos de acesso ao modelo antigo (nav "Meu Questionário", aba "Avaliar").

## Testes / verificação

Sem suíte automatizada no projeto (mesma situação da sessão anterior). Verificação manual via dev server + login de desenvolvimento:

1. Super admin cria um form numa empresa com pergunta de cada tipo, marca uma área inteira + uma pessoa avulsa de outra área, envia.
2. Cada destinatário loga, vê o form em "Formulários pendentes" no Dashboard, responde (testa obrigatória bloqueando envio, testa salvar progresso e voltar depois).
3. Super admin acompanha a tela do form vendo quem respondeu; gera parecer de IA e confirma o conteúdo reflete as respostas.
4. Confirma Visão Geral e Painel de Acompanhamento mostram os números certos.
5. Confirma que "Meu Questionário" e a aba "Avaliar" não aparecem mais em lugar nenhum do menu/navegação.
