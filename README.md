# Системные требования

Должен быть установлен node.js v12+

# Использование без установки

```bash
npx word2com input.xls
```

# Установка глобально
```
npm i -g word2com
word2com input.xls
```

# Установка

В консоли:
```bash
git clone git@github.com:SilentImp/word2com.git
cd word2com
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