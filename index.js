#! /usr/bin/env node
const cluster = require('cluster');
const Spinner = require('cli-spinner').Spinner;
const XLSX = require('xlsx');
const chalk = require("chalk");
const path = require("path");
const fs = require("fs");
const commandLineArgs = require("command-line-args");
const { selectors, urls, MAX_CORES, WORDS_COUNT } = require('./config.js');
const { checkDaddy, addDomainSheet, addWordsSheet, chunkArray, readWords, combinations, getCombinationsList, domainsAvailability } = require('./utils.js');
const puppeteer = require('puppeteer');
 

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
      {
        name: "key",
        alias: "k",
        type: String,
        defaultValue: process.env.GO_DADDY_SECRET
      },
    ];
    const args = commandLineArgs(optionDefinitions);
    
    // Проверяем есть ли аргументы
    if (!args.input) {
      process.stdout.write(
        chalk`{red XLSX filename missing}. Please use --input flag to specify it.\n`
      );
      process.exit(1);
    }
    if (!args.output) args.output = args.input;

    if (!args.key) {
      process.stdout.write(
        chalk`{red Need GoDaddy API Key}. Please use --key flag to specify it or add it to environment variable GO_DADDY_SECRET.\n`
      );
      process.exit(1);
    }

    // Проверяем есть ли файл
    const inputPath = path.resolve(process.cwd(), args.input);
    if (!fs.existsSync(inputPath)) {
      process.stdout.write(
        chalk`{red file ${args.input} not found}. Full path: ${inputPath}.\n`
      );
      process.exit(1);
    }

    // Крутилка что бы не скучно ждать
    const spinner = new Spinner('Работаем. А вы пока посмотрите, какая тут поебень крутится: %s');
    spinner.start();

    try {
    
    // Считываем XLS
    const workbook = XLSX.readFile(inputPath);
    // Получаем все слова
    const data = readWords(workbook);
    // Получаем все комбинации слов
    const words = [...combinations(data, WORDS_COUNT)];

    // Родительский процесс
    const chunks = chunkArray(words, Math.max(numCPUs - 1, 1));

    chunks.map(chunk => {
      // Создаем дочерний процесс
      const worker = cluster.fork();
      // Передаем в дочерний процесс все комбинации для обработки
      worker.send(chunk);
    });
    let report = {};
    let reportsCount = 0;
    // Дочерний процесс возвращает результат работы
    cluster.on('message', async (worker, msg) => {
      report = {...report, ...msg.reports};
      worker.disconnect();
      reportsCount++;
      if (reportsCount === chunks.length) {
        // Опрашиваем goDaddy
        const domainList = Object.keys(report);
        const godaddy = await checkDaddy(domainList, args.key);

        // Собираем все отчеты в один и генерируем новый XLS файл
        const workbook = XLSX.utils.book_new();
        addWordsSheet(workbook, data);
        addDomainSheet(workbook, report, godaddy, msg.godaddyReport);
        XLSX.writeFile(workbook, args.output);
        spinner.stop();
        process.stdout.write(
          chalk`\n{green Success: xls created.}\n`
        );
        process.exit(0);
      }
    });

  } catch (error) {
    spinner.stop();
    process.stdout.write(
        chalk`\n{red Error: ${error.message}}\n`
    );
    process.exit(0);
  }

  })();
} else {
  // Дочерний процесс
  process.on('message', async (wordSet) => {
    const browser = await puppeteer.launch({
      'defaultViewport' : { 'width' : 1400, 'height' : 6000 }
    });
    try {
      const page = await browser.newPage();
      page.setCacheEnabled(false);
      await page.goto(urls.COMBINER, { 'waitUntil' : 'domcontentloaded' });
      let reports = {};
      let wordSetCount = wordSet.length;
      while(wordSetCount--) {
        const keywords = wordSet[wordSetCount];
        await getCombinationsList(page).apply(null, keywords);
        const words = await page.$$eval(selectors.COMBINATION_LIST, elements => elements.map(element => element.innerText));
        const domains = words.map(word => `${word}.com`);
        const domainsAvailabilityPromises = domainsAvailability(domains);
        const result = await Promise.all(domainsAvailabilityPromises);
        const report = result.reduce((collector, domain) => ({...domain, ...collector}), {});
        reports = {...reports, ...report};
      }
      let godaddyReport = {};
      const domainList = Object.keys(reports);
      let domainListCount = domainList.length;
      while(domainListCount--) {
        await page.goto(`${urls.GODADDY_BROWSER}${domainList[domainListCount]}`, { 'waitUntil' : 'domcontentloaded' });
        await page.waitForSelector(selectors.GODADDY_AVAILABILITY,{visible:true});
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
        godaddyReport = {
          ...godaddyReport,
          [[domainList[domainListCount]]]: {
            available: isAvailable,
            primaryPrice,
            secondaryPrice,
          }
        }
      }

      cluster.worker.send({
        reports,
        godaddyReport,
      });
      await browser.close();
    } catch (error) {
      await browser.close();
      console.log(error);
    }
  });
}
