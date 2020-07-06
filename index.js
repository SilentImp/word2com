#! /usr/bin/env node
const cluster = require('cluster');
const XLSX = require('xlsx');
const chalk = require("chalk");
const path = require("path");
const fs = require("fs");
const commandLineArgs = require("command-line-args");
const { selectors, urls, MAX_CORES, WORDS_COUNT } = require('./config.js');
const { checkDaddy, addDomainSheet, addWordsSheet, chunkArray, readWords, combinations, getCombinationsList, domainsAvailability } = require('./utils.js');
const puppeteer = require('puppeteer'); 
const colors = [
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'blackBright',
  'redBright',
  'greenBright',
  'yellowBright',
  'blueBright',
  'magentaBright',
  'cyanBright',
  'whiteBright',
];

// На каждый ноде процесс уходит по ядру.
// Так что дочерних процессов — доступные минус один
const numCPUs = Math.min(require('os').cpus().length, MAX_CORES); 

if (cluster.isMaster) {
  (async () => {
    // Получаем аргументы
    const optionDefinitions = [
      {
        name: "input",
        alias: "i",
        type: String,
        defaultOption: true,
      },
      {
        name: "output",
        alias: "o",
        type: String,
      },
    ];
    const args = commandLineArgs(optionDefinitions);
    
    // Проверяем есть ли аргументы
    if (!args.input) {
      process.stdout.write(
        chalk`\n{red XLSX filename missing}. Please use --input flag to specify it.\n`
      );
      process.exit(1);
    }
    if (!args.output) args.output = args.input;

    // Проверяем есть ли файл
    const inputPath = path.resolve(process.cwd(), args.input);
    if (!fs.existsSync(inputPath)) {
      process.stdout.write(
        chalk`\n{red file ${args.input} not found}. Full path: ${inputPath}.\n`
      );
      process.exit(1);
    }

    try {
    
    // Считываем XLS
    const workbook = XLSX.readFile(inputPath);
    // Получаем все слова
    const data = readWords(workbook);
    // Получаем все комбинации слов
    const words = [...combinations(data, WORDS_COUNT)];

    process.stdout.write(
      chalk`\n{yellow Word combinations: ${JSON.stringify(words)}.}\n`
    );

    // Родительский процесс
    const chunks = chunkArray(words, Math.max(numCPUs - 1, 1));

    process.stdout.write(
      chalk`\n{yellow Forks created: ${chunks.length}.}\n`
    );

    chunks.map((chunk, index) => {
      // Создаем дочерний процесс
      const worker = cluster.fork();
      // Передаем в дочерний процесс все комбинации для обработки
      worker.send({ chunk, index });
    });
    let report = {};
    let reportsCount = 0;
    // Дочерний процесс возвращает результат работы
    cluster.on('message', async (worker, msg) => {
      report = {...report, ...msg};
      worker.disconnect();
      reportsCount++;
      if (reportsCount === chunks.length) {

        // Собираем все отчеты в один и генерируем новый XLS файл
        const workbook = XLSX.utils.book_new();
        addWordsSheet(workbook, data);
        addDomainSheet(workbook, report);
        XLSX.writeFile(workbook, args.output);
        process.stdout.write(
          chalk`\n{green Success: xls created.}\n`
        );
        process.exit(0);
      }
    });

  } catch (error) {
    process.stdout.write(
        chalk`\n{red Error: ${error.message}}\n`
    );
    process.exit(0);
  }

  })();
} else {
  // Дочерний процесс
  process.on('message', async ({ chunk: wordSet, index}) => {
    const browser = await puppeteer.launch({
      'defaultViewport' : { 'width' : 1400, 'height' : 6000 }
    });
    let colorIndex = index;
    while(colorIndex>colors.length) {
      colorIndex-=colors.length;
    }
    try {
      const page = await browser.newPage();
      page.setCacheEnabled(false);
      await page.goto(urls.COMBINER, { 'waitUntil' : 'domcontentloaded' });
      let reports = {};
      let domainList = [];
      let wordSetCount = wordSet.length;
      while(wordSetCount--) {
        try {
          const keywords = wordSet[wordSetCount];
          process.stdout.write(
            chalk`\n{${colors[colorIndex]} Requesting combinations for: ${JSON.stringify(keywords)}. Fork ${index}}\n`
          );
          await getCombinationsList(page).apply(null, keywords);
          const words = await page.$$eval(selectors.COMBINATION_LIST, elements => elements.map(element => element.innerText));
          domainList = [...words.map(word => `${word}.com`), ...domainList];
        } catch(error) {
          await page.screenshot({path: `error-${error.message}.png`});
          continue;
        }
      }
      process.stdout.write(
        chalk`\n{${colors[colorIndex]} Domain List to check: ${JSON.stringify(domainList)}. Fork ${index}}\n`
      );

      let domainListCount = domainList.length;
      while(domainListCount--) {
        process.stdout.write(
          chalk`\n{${colors[colorIndex]} Cheking domain: ${domainList[domainListCount]}. ${((domainList.length - domainListCount)*100/domainList.length).toFixed(1)}% done. Fork ${index}}\n`
        );
        try {
          await page.goto(`${urls.GODADDY_BROWSER}${domainList[domainListCount]}`, { 'waitUntil' : 'domcontentloaded' });
        } catch (error) {
          process.stdout.write(
            chalk`\n{red Error opening: ${domainList[domainListCount]}. Fork ${index}}\n`
          );
          continue;
        }
        try {
          await page.waitForSelector(selectors.GODADDY_AVAILABILITY,{visible:true});
        } catch (error) {
          await page.screenshot({path: `error-${error.message}.png`});
          process.stdout.write(
            chalk`\n{red Error parsing DOM for: ${domainList[domainListCount]}. Fork ${index}}\n`
          );
          continue;
        }
        let isAvailable = 'N/A';
        try {
          isAvailable = await page.$eval(selectors.GODADDY_AVAILABILITY, element => element.innerText.includes('is available'));
        } catch (error) {}
        let primaryPrice = 'N/A';
        try {
          primaryPrice = await page.$eval(selectors.GODADDY_PRICE_PRIMARY, element => element ? element.innerText : 'N/A');
        } catch (error) {}
        let secondaryPrice = 'N/A';
        try {
          secondaryPrice = await page.$eval(selectors.GODADDY_PRICE_SECONDARY, element => element ? element.innerText : 'N/A');
        } catch (error) {}
        reports = {
          ...reports,
          [[domainList[domainListCount]]]: {
            available: isAvailable,
            primaryPrice,
            secondaryPrice,
          }
        }
      }

      process.stdout.write(
        chalk`\n{green Word combinations parsed: ${JSON.stringify(wordSet)}. Fork ${index} closed.}\n`
      );
      cluster.worker.send(reports);
      await browser.close();
    } catch (error) {
      process.stdout.write(
        chalk`\n{red Because of error word combinations skipped: ${JSON.stringify(wordSet)}. Fork ${index} closed.}\n`
      );
      cluster.worker.send({});
      await browser.close();
      console.log(error);
    }
  });
}
