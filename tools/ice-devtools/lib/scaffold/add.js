const inquirer = require('inquirer');
const path = require('path');
const chalk = require('chalk');
const kebabCase = require('kebab-case');
const validateName = require('validate-npm-package-name');

const logger = require('../../utils/logger');
const generate = require('../../utils/generate');
const meta = require('./meta');

/**
 * @param{String} cwd 当前路径
 * @param{Object} opt 参数
 */
module.exports = async function addScaffold(cwd, opt = {}) {
  const {
    npmPrefix,
    templatePath : src
  } = opt;

  const name = await getName(npmPrefix);
  const npmName = getNpmName(name, npmPrefix);
  const dest = path.join(cwd, 'scaffolds', name);

  generate({
    src,
    dest,
    name,
    npmName,
    meta,
    callback: (err) => {
      if (err) {
        logger.fatal(err);
      }
      completedMessage(name, dest);
    }
  });
};

function defaultQuestion(npmPrefix) {
  return [
    {
      type: 'input',
      name: 'name',
      message: 'scaffold name',
      validate: (value) => {
        value = value.trim();
        if (!value) {
          return 'scaffold name cannot be empty';
        }
        const name = getNpmName(value, npmPrefix);
        if (!validateName(name).validForNewPackages) {
          return `this scaffold name(${name}) has already exist. please retry`;
        }
        return true;
      },
    },
  ];
}

/**
 * 获取文件名
 */
async function getName(npmPrefix) {
  const questions = defaultQuestion(npmPrefix); 
  const { name } = await inquirer.prompt(questions);
  return name;
}

/**
 * 获取 npm 包名
 * @param {string} name
 */
function getNpmName(name, npmPrefix) {
  return npmPrefix + kebabCase(name).replace(/^-/, '');
}

/**
 * 区块下载完成后的引导提示信息
 * @param {string} scaffoldName 脚手架模板名称
 * @param {string} scaffoldPath 脚手架模板路径
 */
function completedMessage(scaffoldName, scaffoldPath) {
  console.log();
  console.log(`Success! Created ${scaffoldName} at ${scaffoldPath}`);
  console.log(
    `Inside ${scaffoldName} directory, you can run several commands:`
  );
  console.log();
  console.log('  Starts the development server.');
  console.log(chalk.cyan(`    cd scaffolds/${scaffoldName}`));
  console.log(chalk.cyan('    npm install'));
  console.log(chalk.cyan('    npm start'));
  console.log();
  console.log(
    '  When the development is complete, you need to run npm publish'
  );
  console.log(
    '  Contains screenshots and build, equivalent to npm run build && npm run screenshoy'
  );
  console.log(chalk.cyan('    npm publish'));
  console.log();
}
