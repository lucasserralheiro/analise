# Reformular navegação e Visão Geral da página de empresa (admin)

Data: 2026-08-07

## Problema

A página `/admin/companies/[id]` (e suas sub-páginas Documentos, Resultados, Avaliar) está confusa para o usuário:

1. **Seção "Avaliadores" quebrada.** A Visão Geral busca `/api/companies/:id/evaluators`, uma rota de API que não existe (removida no commit `66e85ca`, junto com o antigo fluxo de "avaliador por token"). O link "Gerenciar" / "Adicionar avaliadores →" aponta para `/admin/companies/:id/evaluators`, página também removida. Resultado: os cards de estatística sempre mostram 0/0/0/0%, e os CTAs levam a 404.
2. **Dado real fica escondido.** O modelo atual é: cada empresa tem áreas envolvidas (`company_areas`), cada área tem admins de área (`admin_users.area_id`), e cada admin responde um questionário por empresa (`evaluations`). Esse progresso real só aparece na aba Resultados — a Visão Geral, que deveria ser o resumo, não mostra nada disso.
3. **Navegação em sub-menu escondido.** A navegação entre Visão Geral / Documentos / Resultados vive dentro da sidebar, abaixo do menu principal, como um bloco secundário — some junto com a sidebar em mobile, e some visualmente atrás do menu principal, que fica destacado (ativo) ao mesmo tempo que o bloco da empresa. Cada sub-página também duplica seu próprio cabeçalho (botão voltar) na mão.

## Objetivo

Tornar óbvio, ao abrir uma empresa: onde estou, para onde posso ir, e o que falta ser feito — sem 404s e sem duplicar navegação.

## Não-objetivos

- Não mexer no fluxo de responder avaliação (`evaluate/page.tsx`) além de torná-lo uma aba.
- Não mexer no gerenciamento de usuários (`/admin/users`) além de linkar para ele.
- Não mudar o schema do banco — todo o dado necessário já existe (`company_areas`, `admin_users`, `evaluations`).

## Arquitetura: layout compartilhado com abas

Criar `app/admin/companies/[id]/layout.tsx`, envolvendo todas as sub-páginas (`page.tsx`, `documents/page.tsx`, `results/page.tsx`, `evaluate/page.tsx`). Esse layout:

- Busca a empresa uma única vez (`useSWR('/api/companies/:id')`) e renderiza o cabeçalho (botão voltar + nome + CNPJ) — hoje cada página faz esse fetch/renderização duplicado.
- Renderiza uma barra de abas logo abaixo do cabeçalho:
  - **Visão Geral** (`/admin/companies/:id`)
  - **Documentos** (`/admin/companies/:id/documents`)
  - **Resultados** (`/admin/companies/:id/results`)
  - **Avaliar** (`/admin/companies/:id/evaluate`) — só renderizada se `user.role === 'area_admin'`
- Cada sub-página passa a exportar só o conteúdo (sem cabeçalho próprio, sem botão voltar próprio).

Aba ativa determinada por `usePathname()` comparando com o `href` de cada aba (mesma lógica `isActive` que já existe no `admin/layout.tsx`, adaptada).

### Sidebar

Remover `companyNavItems` do `app/admin/layout.tsx` — a navegação da empresa deixa de existir na sidebar. A sidebar volta a mostrar só a navegação principal (Dashboard, Empresas, Painel, Áreas, Usuários, Configurações de IA / Meu Questionário), eliminando o destaque duplicado (item "Empresas" ativo + bloco da empresa ativo ao mesmo tempo).

## Visão Geral: novo conteúdo

### Novo endpoint: `GET /api/companies/:id/roster`

Acessível a qualquer admin autenticado (mesmo padrão de abertura da aba Resultados, que não restringe por papel na leitura). Retorna, por área envolvida na empresa:

```ts
{
  area_id: string
  area_name: string
  people: {
    admin_user_id: string
    name: string
    evaluation_status: 'not_started' | 'in_progress' | 'completed'
  }[]
}[]
```

Query: `company_areas` (áreas da empresa) → LEFT JOIN `admin_users` (`role = 'area_admin' AND area_id = ca.area_id`) → LEFT JOIN `evaluations` (`company_id = :id AND admin_user_id = u.id`) para status. Área sem nenhum admin cadastrado retorna `people: []`.

### Layout da Visão Geral

1. **Stats** (mesmo estilo de card já existente): total de pessoas envolvidas / concluíram / pendentes, calculado a partir do roster (substitui o cálculo atual baseado em `/evaluators`).
2. **Barra de progresso** — mesma lógica visual atual, `%` sobre o total de pessoas do roster.
3. **Lista agrupada por área** (estilo "ticket" que já existe no código, adaptado):
   - Cabeçalho da área (nome).
   - Uma linha por pessoa: avatar com inicial, nome, badge de status (Concluída / Em andamento / Não iniciada — mesma paleta de cores já usada: verde/âmbar, mais um cinza para "não iniciada").
   - Área com `people: []`: linha vazia "Nenhum admin de área cadastrado para esta área." + (somente `super_admin`) link "Convidar administrador de área →" para `/admin/users`.
   - Removidos os campos "setor"/"cargo" do design antigo — não existem em `admin_users`; a única segmentação disponível é a própria área (já usada como agrupador).
4. **Ações rápidas**: mantém "Responder minha avaliação →", agora só exibido quando `user.role === 'area_admin'` **e** a área do usuário está entre as áreas envolvidas da empresa (pequena correção: hoje o link aparece para qualquer area_admin, mesmo de área não envolvida, e leva a um erro 403 ao tentar responder). Remove o link inline "Ver resultados de todas as áreas →" (a informação de navegação passa a ser só pela aba Resultados, evitando duplicidade).
5. Remove todo uso de `/api/companies/:id/evaluators` e do link para `/admin/companies/:id/evaluators`.

## Fluxo de dados

- `layout.tsx`: `useSWR('/api/companies/:id')` — cabeçalho.
- `page.tsx` (Visão Geral): `useSWR('/api/companies/:id/roster')` — stats + lista.
- Demais páginas (Documentos, Resultados, Avaliar): sem mudança de fetch, só perdem o cabeçalho duplicado.

## Tratamento de erros / estados vazios

- `roster` carregando: mesmo spinner padrão já usado nas outras páginas.
- Empresa sem nenhuma área envolvida: estado vazio "Nenhuma área envolvida nesta empresa ainda." (situação hoje não tratada explicitamente — cai no mesmo vazio de "avaliadores").
- Falha no fetch do roster: mesmo padrão de erro silencioso das outras chamadas (`fetcher` já lança e o SWR não popula `data`; a tela mostra o spinner indefinidamente, consistente com o padrão existente no resto do app — não introduzir tratamento de erro novo fora do escopo).

## Testes / verificação

Sem suíte de testes automatizados no projeto (verificado: não há diretório `__tests__` nem `*.test.ts`). Verificação manual via `run`/browser:

1. Abrir uma empresa com áreas envolvidas e pelo menos um admin de área com avaliação concluída e um pendente → conferir stats, barra de progresso e lista agrupada corretas.
2. Abrir uma empresa com uma área sem nenhum admin cadastrado → conferir aviso e (logado como super admin) o link para `/admin/users`.
3. Navegar entre as 4 abas (incluindo Avaliar logado como area_admin) → conferir aba ativa destacada corretamente e ausência de qualquer link para `/evaluators`.
4. Conferir sidebar sem o bloco de navegação da empresa e sem destaque duplicado no item "Empresas".
5. Redimensionar para mobile → conferir que cabeçalho + abas continuam acessíveis sem depender da sidebar (que agora só tem o menu principal).
