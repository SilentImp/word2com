const XLSX = require('xlsx');
const whois = require('whois');
const chalk = require("chalk");
const { WORDS_SHEET, DOMAINS_SHEET, AVAILABLE, NOT_AVAILABLE, NO_INFORMATION, LOOKUP_RETRY_COUNT, LOOKUP_DELAY, LOOKUP_TIMEOUT } = require('./config.js');
const { selectors, urls } = require('./config.js');

/**
 * Разбивает список доменов на группы
 *
 * @param urls {String[]} — URLs array
 * @param cors {Number} — count of available cors
 * @return {Array} — URLs array splited to chunks
 */
function chunkArray(urls, cors) {
  const chunks = [...Array(Math.min(urls.length, cors))].map(() => []);
  let index = 0;
  urls.forEach((url) => {
    if (index > (chunks.length - 1)) {
      index = 0;
    }
    chunks[index].push(url);
    index += 1;
  });
  return chunks;
}

// Генерирует все комбинации слов в массиве
function* combinations(array, k, n = array.length) {
  if (k < 1) {
    yield [];
  } else {
    for (let i = --k; i < n; i++) {
      for (let combination of combinations(array, k, i)) {
        combination.push(array[i]);
        yield combination;
      }
    }
  }
}

// Считывает все слова со страницы с именем WORDS_SHEET
const readWords = workbook => Object.entries(workbook.Sheets[WORDS_SHEET])
  .filter(([name, value]) => !/^!/ig.test(name) )
  .map(([name, value]) => value.v);

// Заполняет форму словами переданными в качестве аргумента и отправляет форму
const getCombinationsList = page => async (...words) => {
  let index = words.length;
  if (index > 4) {
    process.stdout.write(
      chalk`{red Only 4 words allowed, other would be skipped.}\n`
    );
    index = 4;
  }
  while (index--) {
    await page.waitForSelector(selectors[`INPUT_${index+1}`],{visible:true});
    await page.$eval(selectors[`INPUT_${index+1}`], element => {
      element.value = "";
      element.scrollIntoView({
        inline: 'center',
        block: 'center',
      });
    });
    await page.click(selectors[`INPUT_${index+1}`], {clickCount: 3});
    await page.keyboard.type(words[index]);
  }
  await page.waitForSelector(selectors.SUBMIT_BUTTON,{visible:true});
  await page.$eval(selectors.SUBMIT_BUTTON, element => {
    element.scrollIntoView({
      inline: 'center',
      block: 'center',
    });
  });
  await page.click(selectors.SUBMIT_BUTTON, { waitUntil: 'networkidle2' });
  await page.waitForSelector(selectors.COMBINATION_LIST);
}

// Проверяет массив доменов — свободны или заняты
const domainsAvailability = domains => domains.map(domain => new Promise((resolve) => {

  let repeatCount = LOOKUP_RETRY_COUNT;
  const lookup = (resolve, domain) => {

    whois.lookup(domain, {timeout:LOOKUP_TIMEOUT}, function(error, data) {
      if(error) {
        if (repeatCount > 0) {
          repeatCount--;
          setTimeout(()=>{lookup(resolve, domain)}, LOOKUP_DELAY);
        } else {
          resolve({[[domain]]: null});
        }
      } else {
        const isTaken = data.indexOf('Domain Name:') !== -1;
        resolve({[[domain]]: !isTaken});
      }
    });

  };
  lookup(resolve, domain);
}));

// Добавляет в эксель страницу доменов
const addDomainSheet = (book, domains) => {
  const data = Object.entries(domains).map(([domain, available]) => [domain, (available === true ? AVAILABLE : (available === null ? NO_INFORMATION : NOT_AVAILABLE))]);
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(book, sheet, DOMAINS_SHEET);
}

// Добавляет в эксель страницу слов
const addWordsSheet = (book, words) => {
  const data = words.map(word => [word]);
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(book, sheet, WORDS_SHEET);
}


module.exports = {
  chunkArray,
  combinations,
  readWords,
  getCombinationsList,
  domainsAvailability,
  addDomainSheet,
  addWordsSheet,
}