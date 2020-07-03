# Системные требования

Должен быть установлен node.js v12+

# Использование без установки

```bash
npx word2com input.xls
```

# Установка

В консоли:
```bash
npm ci
```

# Использование

В консоли:
```bash
node ./index.js --input test.xlsx --output output.xlsx
```
или
```bash
npm start --input test.xlsx --output output.xlsx
```
или
```bash
npm start --input test.xlsx
```

или
```bash
npm start test.xlsx
```

или
```bash
node ./index.js test.xlsx
```

Если не указан --output — будет перезаписан оригинальный файл