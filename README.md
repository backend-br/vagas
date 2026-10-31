<!--suppress HtmlDeprecatedAttribute -->

<p align="center">
  <img src="https://avatars3.githubusercontent.com/u/30732658?v=4&s=200.jpg" alt="BackEndBR" width="230" />
</p>

# Vagas

Espaço para a divulgação de vagas para desenvolvedores backend via issues do Github.

## Como cadastrar uma vaga?

Abra uma [issue](https://github.com/backend-br/vagas/issues/new/choose) usando o formulário em português ou em
inglês. Os labels de nível, regime, modelo de trabalho e tecnologias são aplicados a partir do formulário. Eles seguem
a [taxonomia compartilhada](https://github.com/backend-br/.github/blob/main/taxonomy.json) com o
[me-contrata](https://github.com/backend-br/me-contrata).

Toda vaga nova passa por uma triagem automática:

- Uma vaga por issue, apenas para backend (ou fullstack com foco em backend).
- Vagas de treinamento de IA, anotação de dados ou avaliação de modelos não são aceitas.
- Vagas aprovadas recebem o label `verificada`. Vagas com dúvida recebem `em-triagem` e são revisadas por uma pessoa
  mantenedora. Vagas recusadas são fechadas com um comentário explicando o motivo; basta editar a issue para ela ser
  reavaliada.

Para ver apenas vagas aprovadas, use o filtro
[`label:verificada`](https://github.com/backend-br/vagas/issues?q=is%3Aissue+is%3Aopen+label%3Averificada).

Para mantenedores: revise as vagas em
[`label:em-triagem`](https://github.com/backend-br/vagas/issues?q=is%3Aissue+is%3Aopen+label%3Aem-triagem). Para
aprovar, troque `em-triagem` por `verificada`; autores com 3 vagas verificadas passam a ir direto para `verificada`. Para
que a triagem nunca mais altere uma issue, adicione `revisada`. As regras ficam em `.github/triage/config.json`.

Três rotinas cuidam das vagas já publicadas, sem uso de IA:

- **Links:** todo dia os links das vagas abertas são verificados. Só conta como quebrado o link cuja página responde
  que não existe mais (404 ou 410) em três tentativas seguidas; bloqueios, lentidão e erros do site são ignorados. A
  vaga recebe o label `link-quebrado` e um comentário com os links. Se nenhum link para se candidatar voltar a funcionar
  em 3 dias, a issue é fechada. Links do LinkedIn não são verificados, porque o site bloqueia robôs.
- **Formato:** o título é ajustado na hora, só no que é certo: o prefixo do modelo de trabalho (`[REMOTO]` vira
  `[Remoto]`, e entra quando falta), travessões e espaços. Uma vaga com o texto fora do padrão do formulário recebe o
  label `formato-sugerido` e um comentário com a mesma vaga reorganizada no formato do formulário, com o texto original
  e sem nada inventado. O texto só muda quando quem publicou editar a vaga ou uma pessoa mantenedora adicionar o label
  `aplicar-formato`. O texto anterior continua no histórico de edições da issue.
- **Perfis compatíveis:** toda vaga `verificada` recebe um comentário com até 5 perfis do
  [me-contrata](https://github.com/backend-br/me-contrata) que pediram para ser divulgados. Entram só perfis com o mesmo
  nível, ao menos um regime e um modelo de trabalho em comum, a mesma UF quando a vaga é híbrida ou presencial, e ao
  menos 2 tecnologias em comum (ou a única, quando a vaga tem uma só). Ninguém é mencionado. O comentário é atualizado
  todo dia, e some quando nenhum perfil combina mais.

As três rodam também pela aba Actions, para uma issue ou para todas, em modo de simulação por padrão. Enquanto
`automaticRunsDryRun` estiver `true` em `.github/triage/config.json`, as execuções automáticas (agendadas e por
evento) também só simulam e mostram o resultado no resumo da execução.

### Posting a job in English

Open an [issue](https://github.com/backend-br/vagas/issues/new/choose) with the English form. Posts go through the same
automatic triage: one backend job per issue, no AI training gigs.

## Como receber atualizações das vagas?

Você pode receber atualizações das vagas no seu e-mail ou via notificações do GitHub, basta clicar **Subscribe**, na
issue que você tem interesse.

Você também pode [pesquisar e filtrar as vagas da Backend BR no openings.dev](https://openings.dev/communities/backend-br/vagas). Cada resultado continua levando à issue original neste repositório.

<p align="center">
    <img src="doc/images/subscribe.jpg" alt="subscribe."/>
    <br />
    <tl>Ativar notificações.</tl>
</p>

## Outros repositórios de vagas

### Por área

- [Vagas para QAs](https://github.com/qa-brasil/vagas)
- [Vagas para Chat-Bot](https://github.com/chatbotbr/vagas)
- [Vagas para Back-End](https://github.com/backend-br/vagas)
- [Vagas para Front-End](https://github.com/frontendbr/vagas)

### Por tecnologia

- [Vagas para PHP](https://github.com/phpdevbr/vagas)
- [Vagas para .NET](https://github.com/dotnetdevbr/vagas)
- [Vagas para Rust](https://github.com/rustdevbr/vagas)
- [Vagas para Kotlin](https://github.com/kotlin-br/vagas)
- [Vagas para Vue.js](https://github.com/vuejs-br/vagas)
- [Vagas para Android](https://github.com/androiddevbr/vagas)
- [Vagas para Flutter](https://github.com/flutter-brazil/vagas)
- [Vagas para iOS e OSX](https://github.com/CocoaHeadsBrasil/vagas)
- [Vagas para Go/Golang](https://github.com/Gommunity/vagas)
- [Vagas para React/React Native](https://github.com/react-brasil/vagas)
- [Vagas para Python](https://github.com/pydevbr/vagas)
- [Vagas para Node.JS](https://github.com/nodejsdevbr/vagas)

### Por localidade

- [Vagas para no Ceará](https://github.com/CangaceirosDevels/vagas_de_emprego)
- [Vagas para Back-end (Angola)](https://github.com/backend-ao/vagas)
- [Vagas para Front-end (Angola)](https://github.com/frontend-ao/vagas)
- [Vagas para Back-end (Portugal)](https://github.com/backend-pt/vagas)
- [Vagas para Front-end (Portugal)](https://github.com/frontend-pt/vagas)
- [Vagas para Back-end e Frontend(Brasil)](https://github.com/rafaelsilva81/githubvagasbrasil)

<div id='license'></div>

## Licença

Licenciado sob [MIT](LICENSE).

<div id='contributing'></div>

## Contribuindo

Siga as [diretrizes de contribuição](CONTRIBUTING.md) para contribuir com o projeto.

## Agradecimento

Agradecemos a comunidade [Front-end Brasil](https://github.com/frontendbr) que nos inspirou, e essa página é um fork
deles.
