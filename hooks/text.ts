// Every word the map shows, in each language it speaks.
// A new language is one more table here and one more value of `language` in package.json.
import type { StationId } from '../types'

export type Strings = {
  title: string
  /** The pane's buttons in an editor, where the pane cannot be made taller. */
  zoomOut: string
  zoomIn: string
  hideMap: string
  showMap: string
  stations: Record<StationId, string>
  newMessage: string
  answerReady: string
  turnAborted: string
  step: (n: number) => string
  subagent: string
  running: string
  nothingYet: string
  noCounts: string
  idle: string
  context: string
  andMore: (n: number) => string
  webSearch: string
  artifact: string
  workflow: string
  skill: string
  loadingTools: string
  questionForYou: string
  fileForYou: string
  ms: (n: number) => string
  seconds: (s: string) => string
  minutes: (m: number, s: number) => string
}

const en: Strings = {
  title: 'Work map',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  hideMap: 'Hide map',
  showMap: 'Show map',
  stations: {
    you: 'Operator',
    model: 'Model',
    memory: 'Memory',
    files: 'Files',
    shell: 'Shell',
    web: 'Network',
    browser: 'Browser',
    agents: 'Agents',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'new message',
  answerReady: 'answer ready',
  turnAborted: 'turn interrupted',
  step: n => `step ${n}`,
  subagent: 'subagent',
  running: 'running',
  nothingYet: 'Nothing yet.',
  noCounts: 'No counts yet.',
  idle: 'Nothing is running.',
  context: 'context',
  andMore: n => ` and ${n} more`,
  webSearch: 'web search',
  artifact: 'artifact',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'loading tools',
  questionForYou: 'question for you',
  fileForYou: 'file for you',
  ms: n => `${n} ms`,
  seconds: s => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const ru: Strings = {
  title: 'Карта работы',
  zoomOut: 'Уменьшить',
  zoomIn: 'Увеличить',
  hideMap: 'Скрыть карту',
  showMap: 'Показать карту',
  stations: {
    you: 'Оператор',
    model: 'Модель',
    memory: 'Память',
    files: 'Файлы',
    shell: 'Терминал',
    web: 'Сеть',
    browser: 'Браузер',
    agents: 'Агенты',
    skills: 'Скиллы',
    hooks: 'Хуки',
  },
  newMessage: 'новое сообщение',
  answerReady: 'ответ готов',
  turnAborted: 'ход прерван',
  step: n => `шаг ${n}`,
  subagent: 'субагент',
  running: 'идёт',
  nothingYet: 'Пока ничего не было.',
  noCounts: 'Счётчики пусты.',
  idle: 'Ожидание',
  context: 'контекст',
  andMore: n => ` и ещё ${n}`,
  webSearch: 'поиск в сети',
  artifact: 'артефакт',
  workflow: 'рабочий процесс',
  skill: 'скилл',
  loadingTools: 'загрузка инструментов',
  questionForYou: 'вопрос тебе',
  fileForYou: 'файл тебе',
  ms: n => `${n} мс`,
  seconds: s => `${s} с`,
  minutes: (m, s) => `${m} мин ${s} с`,
}

const es: Strings = {
  title: 'Mapa de trabajo',
  zoomOut: 'Alejar',
  zoomIn: 'Acercar',
  hideMap: 'Ocultar mapa',
  showMap: 'Mostrar mapa',
  stations: {
    you: 'Operador',
    model: 'Modelo',
    memory: 'Memoria',
    files: 'Archivos',
    shell: 'Terminal',
    web: 'Red',
    browser: 'Navegador',
    agents: 'Agentes',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'mensaje nuevo',
  answerReady: 'respuesta lista',
  turnAborted: 'turno interrumpido',
  step: n => `paso ${n}`,
  subagent: 'subagente',
  running: 'en curso',
  nothingYet: 'Todavía nada.',
  noCounts: 'Aún no hay recuentos.',
  idle: 'No hay nada en ejecución.',
  context: 'contexto',
  andMore: n => ` y ${n} más`,
  webSearch: 'búsqueda web',
  artifact: 'artefacto',
  workflow: 'flujo de trabajo',
  skill: 'skill',
  loadingTools: 'cargando herramientas',
  questionForYou: 'pregunta para ti',
  fileForYou: 'archivo para ti',
  ms: n => `${n} ms`,
  seconds: s => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const fr: Strings = {
  title: 'Carte du travail',
  zoomOut: 'Dézoomer',
  zoomIn: 'Zoomer',
  hideMap: 'Masquer la carte',
  showMap: 'Afficher la carte',
  stations: {
    you: 'Opérateur',
    model: 'Modèle',
    memory: 'Mémoire',
    files: 'Fichiers',
    shell: 'Terminal',
    web: 'Réseau',
    browser: 'Navigateur',
    agents: 'Agents',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'nouveau message',
  answerReady: 'réponse prête',
  turnAborted: 'tour interrompu',
  step: n => `étape ${n}`,
  subagent: 'sous-agent',
  running: 'en cours',
  nothingYet: 'Rien pour le moment.',
  noCounts: 'Aucun compteur pour le moment.',
  idle: 'Rien en cours.',
  context: 'contexte',
  andMore: n => ` et ${n} de plus`,
  webSearch: 'recherche web',
  artifact: 'artefact',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'chargement des outils',
  questionForYou: 'question pour vous',
  fileForYou: 'fichier pour vous',
  ms: n => `${n} ms`,
  seconds: s => `${s.replace('.', ',')} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const de: Strings = {
  title: 'Arbeitskarte',
  zoomOut: 'Verkleinern',
  zoomIn: 'Vergrößern',
  hideMap: 'Karte ausblenden',
  showMap: 'Karte zeigen',
  stations: {
    you: 'Operator',
    model: 'Modell',
    memory: 'Gedächtnis',
    files: 'Dateien',
    shell: 'Terminal',
    web: 'Netzwerk',
    browser: 'Browser',
    agents: 'Agenten',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'neue Nachricht',
  answerReady: 'Antwort fertig',
  turnAborted: 'Durchgang abgebrochen',
  step: n => `Schritt ${n}`,
  subagent: 'Subagent',
  running: 'läuft',
  nothingYet: 'Noch nichts.',
  noCounts: 'Noch keine Zählerstände.',
  idle: 'Nichts läuft.',
  context: 'Kontext',
  andMore: n => ` und ${n} weitere`,
  webSearch: 'Websuche',
  artifact: 'Artefakt',
  workflow: 'Workflow',
  skill: 'Skill',
  loadingTools: 'Werkzeuge werden geladen',
  questionForYou: 'Frage an dich',
  fileForYou: 'Datei für dich',
  ms: n => `${n} ms`,
  seconds: s => `${s.replace('.', ',')} s`,
  minutes: (m, s) => `${m} Min. ${s} s`,
}

const it: Strings = {
  title: 'Mappa del lavoro',
  zoomOut: 'Riduci',
  zoomIn: 'Ingrandisci',
  hideMap: 'Nascondi mappa',
  showMap: 'Mostra mappa',
  stations: {
    you: 'Operatore',
    model: 'Modello',
    memory: 'Memoria',
    files: 'File',
    shell: 'Terminale',
    web: 'Rete',
    browser: 'Browser',
    agents: 'Agenti',
    skills: 'Skill',
    hooks: 'Hook',
  },
  newMessage: 'nuovo messaggio',
  answerReady: 'risposta pronta',
  turnAborted: 'turno interrotto',
  step: n => `passo ${n}`,
  subagent: 'subagente',
  running: 'in corso',
  nothingYet: 'Ancora niente.',
  noCounts: 'Ancora nessun conteggio.',
  idle: 'Niente in esecuzione.',
  context: 'contesto',
  andMore: n => ` e altri ${n}`,
  webSearch: 'ricerca web',
  artifact: 'artefatto',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'caricamento strumenti',
  questionForYou: 'domanda per te',
  fileForYou: 'file per te',
  ms: n => `${n} ms`,
  seconds: s => `${s.replace('.', ',')} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

// European Portuguese.
const pt: Strings = {
  title: 'Mapa de trabalho',
  zoomOut: 'Reduzir',
  zoomIn: 'Ampliar',
  hideMap: 'Ocultar mapa',
  showMap: 'Mostrar mapa',
  stations: {
    you: 'Operador',
    model: 'Modelo',
    memory: 'Memória',
    files: 'Ficheiros',
    shell: 'Terminal',
    web: 'Rede',
    browser: 'Navegador',
    agents: 'Agentes',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'nova mensagem',
  answerReady: 'resposta pronta',
  turnAborted: 'turno interrompido',
  step: n => `passo ${n}`,
  subagent: 'subagente',
  running: 'em curso',
  nothingYet: 'Ainda nada.',
  noCounts: 'Ainda sem contagens.',
  idle: 'Nada em execução.',
  context: 'contexto',
  andMore: n => ` e mais ${n}`,
  webSearch: 'pesquisa na web',
  artifact: 'artefacto',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'a carregar ferramentas',
  questionForYou: 'pergunta para ti',
  fileForYou: 'ficheiro para ti',
  ms: n => `${n} ms`,
  seconds: s => `${s.replace('.', ',')} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const TABLES = new Map<unknown, Strings>([['en', en], ['ru', ru], ['es', es], ['fr', fr], ['de', de], ['it', it], ['pt', pt]])

export const stringsFor = (language: unknown): Strings => TABLES.get(language) ?? en

/** The language codes the tables hold; anything else reads as `en`, here as in the settings. */
export const LANGUAGES: readonly string[] = [...TABLES.keys()].map(String)
