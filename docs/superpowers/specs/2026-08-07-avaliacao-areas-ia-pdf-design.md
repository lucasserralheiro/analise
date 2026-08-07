# Design: Login por Google, papéis por área, questionários reaproveitáveis, análise técnica por IA e exportação em PDF

**Data:** 2026-08-07 (revisão 2)
**Projeto:** Sistema de Avaliação 360 (Prodam) — app em `analise/` (Next.js 16 + Neon Postgres + Tailwind/shadcn)

## Contexto

O sistema hoje permite cadastrar empresas, anexar documentos, cadastrar avaliadores (funcionários da Prodam) por empresa e coletar respostas via link único por token (sem login), com um único questionário genérico por empresa (escala 0–10 + comentário). O login administrativo hoje é email/senha (JWT + bcrypt).

Este documento substitui esse modelo por: (1) login via Google para todo mundo; (2) papéis — `super_admin` e `area_admin` — em que o próprio `area_admin` é quem responde a avaliação da sua área (não existe mais avaliador convidado por link); (3) questionários reaproveitáveis por área, globais; (4) empresas com áreas selecionáveis; (5) documentos compartilhados; (6) transparência de leitura entre áreas; (7) painel de acompanhamento pro gestor; (8) motor de análise técnica via IA (Gemini); (9) exportação em PDF com estilo decidido pela IA.

## Fora de escopo (v1)

- Leitura de conteúdo de arquivos Word/Excel/PowerPoint pela IA — só PDF e imagens são lidos; os demais aparecem listados por nome no relatório.
- Migração de dados existentes de teste — o modelo muda estruturalmente (login, avaliadores, questionários); dados de teste atuais podem ser descartados.
- Escolha final da versão do Gemini (Pro vs Flash) — decidir na implementação; o código deve deixar o modelo fácil de trocar via variável de ambiente.

---

## 1. Autenticação — login via Google

- **Login exclusivamente via Google** (OAuth), para todo mundo — `super_admin` e `area_admin`. Substitui o sistema atual de email/senha (JWT próprio + bcrypt); os endpoints `/api/auth/login`, `/api/auth/register` e a lib `lib/auth.ts` baseada em senha são removidos.
- **Modelo de convite:** não existe autocadastro. O `super_admin` pré-cadastra cada pessoa (nome, email do Google, papel, área quando `area_admin`) em `admin_users`. Quando essa pessoa faz login com o Google usando esse mesmo email, o sistema reconhece e libera o acesso com o papel configurado. Um email do Google que não está pré-cadastrado não tem acesso.
- **Pré-requisito de infraestrutura:** é necessário criar um projeto no Google Cloud e configurar credenciais OAuth (Client ID/Secret) — passo de configuração que você vai precisar fazer, parecido com gerar a chave de API do Gemini.
- **Biblioteca:** Auth.js (NextAuth) com o provider Google — é o padrão para login social em apps Next.js e cuida da troca de tokens, sessão e cookies.

### Modelo de dados

- `admin_users`: `id`, `name`, `email` (email do Google — chave de reconhecimento), `role` (`super_admin` | `area_admin`), `area_id` (nullable; obrigatório quando `role = area_admin`), `created_at`. Remove `password_hash`.

---

## 2. Papéis, permissões e transparência

- **`super_admin`** — acesso total: cadastra áreas, cadastra `area_admins`, cadastra empresas e escolhe quais áreas avaliam cada empresa, configura IA e PDF, vê o Painel de Acompanhamento completo, e pode ver/gerar tudo de qualquer área.
- **`area_admin`** (vinculado a uma área) pode:
  - Editar as perguntas do questionário da **sua** área (template único, global).
  - Responder a avaliação da sua área para qualquer empresa em que sua área esteja marcada como envolvida (ele é o avaliador — não existe mais um cadastro de avaliador separado).
  - Cadastrar empresas novas.
  - Ver, baixar e adicionar documentos em qualquer empresa (espaço compartilhado, sem restrição por área).
  - **Ver** (somente leitura) os questionários e os resultados/notas de **todas** as áreas, não só a própria — transparência total de leitura. Só pode **editar** o questionário e **responder** pela própria área.
- **Múltiplos `area_admins` na mesma área:** cada um responde sua própria avaliação de forma independente para uma mesma empresa (mantém o espírito "360" original — várias pessoas da mesma área podem dar notas próprias). O parecer da IA para aquela área considera o conjunto de respostas de todos os `area_admins` daquela área.

**Painel de Acompanhamento (`super_admin`):** por empresa, uma grade Área × Status, mostrando só as áreas marcadas como envolvidas naquela empresa (ver seção 3), com quantos `area_admins` daquela área já concluíram vs. o total de `area_admins` cadastrados na área — para identificar rapidamente onde está travado e cobrar os responsáveis.

---

## 3. Empresas, áreas envolvidas e documentos compartilhados

- Nova tabela **`areas`** (`id`, `name`, `order_index`) — catálogo editável só pelo `super_admin`. Lista inicial de exemplo (Infraestrutura, Arquitetura, Segurança, Negócio, Jurídico), ajustável.
- Nova tabela **`company_areas`** (`company_id`, `area_id`) — ao cadastrar (ou editar) uma empresa, o `super_admin` escolhe quais áreas vão avaliá-la. Só essas áreas aparecem no Painel daquela empresa, e só os `area_admins` dessas áreas podem responder por ela.
- **Documentos** (`documents`, já existe): sem alteração de schema — a mudança é de permissão: qualquer `admin_user` (`super_admin` ou `area_admin` de qualquer área) pode ver, baixar e adicionar documentos de qualquer empresa.

---

## 4. Questionários reaproveitáveis por área

- **`questionnaires` deixa de ter `company_id`** e passa a ter `area_id` — um questionário por área, global, reaproveitado em todas as empresas. O `area_admin` da área monta esse questionário uma vez (perguntas com escala 0–10 + comentário, como hoje); toda empresa nova usa o mesmo conjunto de perguntas daquela área.
- **Elimina-se:** a tabela/fluxo de `evaluators`/`participants` (cadastro de avaliador por empresa com token), `response_tokens`, as páginas públicas `/avaliar/*` e as rotas `/api/evaluator/[token]/*`.
- **Nova tabela `evaluations`**: `id`, `company_id`, `area_id`, `admin_user_id` (o `area_admin` que respondeu), `status` (`in_progress` | `completed`), `completed_at`, `created_at` — uma avaliação = um `area_admin` respondendo o questionário da sua área para uma empresa.
- **`answers`** (já existe, ajustada): `id`, `evaluation_id`, `question_id`, `score` (0–10), `comment`.

---

## 5. Análise técnica por IA

- **Provedor:** Google Gemini, via API do Google AI Studio (chave de API simples). Modelo configurável por variável de ambiente (padrão a definir na implementação).
- **Gatilho:** manual — botão "Gerar Análise" na tela da empresa. `super_admin` gera a análise completa; um `area_admin` pode gerar/regenerar só a parte da análise da sua área.
- **Entrada:**
  - Documentos PDF e imagem da empresa (conteúdo lido diretamente pela IA).
  - Documentos Word/Excel/PowerPoint aparecem listados por título, sem conteúdo lido.
  - Notas e comentários de todas as avaliações (de todos os `area_admins`), agrupados por área.
- **Saída:** um parecer geral da empresa + um parecer específico por área.
- **Histórico:** cada geração cria um novo registro (não sobrescreve a anterior).
- **Prompt configurável:** tela de configurações (`super_admin` apenas) com um campo de texto livre — "Instruções para a IA" — injetado no prompt de geração, com um valor padrão sensato pré-preenchido.

### Modelo de dados

- `ai_analyses`: `id`, `company_id`, `status` (`pending`/`completed`/`failed`), `overall_content`, `created_by` (`admin_user_id`), `created_at`, `model_used`.
- `ai_analysis_areas`: `id`, `analysis_id`, `area_id`, `content`.
- `ai_settings`: `instructions` (texto livre editável pelo `super_admin`).

---

## 6. Exportação em PDF

- **Biblioteca:** `@react-pdf/renderer` — gera o PDF em Node, sem depender de navegador headless; roda numa rota de API do Next.js.
- **Gatilho:** botão "Baixar PDF" na tela da empresa — gera na hora, a partir da análise de IA mais recente + notas atuais, baixa direto (não fica armazenado no servidor).
- **Conteúdo:** capa com a empresa, parecer geral da IA, parecer por área, tabela de notas por área/avaliador, gráfico de médias, lista de documentos (incluindo os não lidos pela IA, listados por nome).
- **Estilo decidido pela IA:** tela de configurações (`super_admin` apenas) com upload de logo + campo de texto livre ("Instruções de estilo do relatório"). A cada exportação, esse texto é enviado à IA junto com a lista de fontes disponíveis no sistema (biblioteca curada de ~6–8 fontes profissionais já embutidas no código — restrição técnica real: um PDF só renderiza fontes de fato embutidas, a IA escolhe dentro dessa lista) e a IA retorna um estilo estruturado (cor primária/secundária, fonte, ênfase de estrutura) que alimenta o template do PDF.

### Modelo de dados

- `pdf_settings`: `logo_url`, `style_instructions`.

---

## Fluxo de uso ponta a ponta

1. **Setup (`super_admin`):** configura o projeto Google OAuth; cadastra áreas; pré-cadastra os `area_admins` (nome, email do Google, área); preenche instruções de IA e de estilo do PDF.
2. **`area_admin` monta o questionário da sua área** (uma vez, reaproveitado depois).
3. **`super_admin` cadastra uma empresa** e escolhe quais áreas vão avaliá-la.
4. **Documentos:** qualquer admin sobe documentos no perfil da empresa (espaço compartilhado).
5. **Cada `area_admin` das áreas envolvidas responde sua própria avaliação** para aquela empresa, logado via Google.
6. **Transparência:** qualquer `area_admin` pode consultar (leitura) os questionários e resultados de todas as áreas, não só a própria.
7. **`super_admin` acompanha pelo Painel** — grade Área × Status (só das áreas envolvidas), com progresso por `area_admin`.
8. **Gerar análise de IA** — `super_admin` (completa) ou `area_admin` (sua área) clica "Gerar Análise".
9. **`super_admin` baixa o PDF final.**

---

## Revisão da spec

- **Placeholders / lacunas:** nenhum campo fica sem valor padrão — onde a decisão exata foi deixada em aberto (versão do Gemini, lista final de áreas, lista final de fontes), o padrão é claramente marcado como ajustável na implementação, sem bloquear o desenvolvimento.
- **Consistência interna:** o modelo de questionário por área (global) e de avaliação (`area_admin` autenticado, sem link por token) é usado de forma consistente em todas as seções — Painel, transparência entre áreas, IA e PDF assumem essa mesma estrutura.
- **Escopo:** este documento cobre seis frentes interligadas (login Google, papéis/transparência, empresas/áreas envolvidas, questionários, IA, PDF), tratadas como fases de um mesmo plano de implementação. A base (login + papéis + áreas + questionários + avaliações) é pré-requisito das duas últimas (IA e PDF).
