const MAX_CORES = 10;
const WORDS_SHEET = 'Входящие слова';
const DOMAINS_SHEET = 'Домены';
const WORDS_COUNT = 2;
const AVAILABLE = 'свободно';
const NOT_AVAILABLE = 'занято';
const NO_INFORMATION = '???';
const LOOKUP_RETRY_COUNT = 10;
const LOOKUP_TIMEOUT = 5000;
const LOOKUP_DELAY = 1000;
const urls = {
  COMBINER: 'https://www.wordunscrambler.net/word-combiner.aspx',
};
const selectors = {
  INPUT_1: 'input[name=word1]',
  INPUT_2: 'input[name=word2]',
  INPUT_3: 'input[name=word3]',
  INPUT_4: 'input[name=word4]',
  SUBMIT_BUTTON: 'button[name="u_w"]',
  COMBINATION_LIST: '.words',
};

module.exports = {
  LOOKUP_TIMEOUT,
  LOOKUP_RETRY_COUNT,
  LOOKUP_DELAY,
  NO_INFORMATION,
  WORDS_SHEET,
  DOMAINS_SHEET,
  WORDS_COUNT,
  AVAILABLE,
  NOT_AVAILABLE,
  MAX_CORES,
  urls,
  selectors,
}