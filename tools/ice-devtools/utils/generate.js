/* eslint no-unused-expressions: 0 */
const chalk = require('chalk');
const fs = require('fs');
const Metalsmith = require('metalsmith');
const Handlebars = require('handlebars');
const uppercamelcase = require('uppercamelcase');
const async = require('async');
const render = require('consolidate').handlebars.render;
const path = require('path');
const multimatch = require('multimatch');
const kebabCase = require('kebab-case');
const getOptions = require('./options');
const ask = require('./ask');
const filter = require('./filter');
const transform = require('./transform');
const logger = require('./logger');
const debug = require('debug')('ice:generate');
const innerNet = require('../utils/inner-net');

const TEMPLATE_PATH = '.template';

// register handlebars helper
Handlebars.registerHelper('if_eq', (a, b, opts) => {
  return a === b ? opts.fn(this) : opts.inverse(this);
});

Handlebars.registerHelper('unless_eq', (a, b, opts) => {
  return a === b ? opts.inverse(this) : opts.fn(this);
});

/**
 * Generate a template given a `src` and `dest`.
 *
 * @param {String} name
 * @param {String} npmName
 * @param {String} src
 * @param {String} dest
 * @param {Function} done
 */
module.exports = function generate(options) {
  const {
    src,
    dest,
    name,
    npmName,
    callback : done,
    meta
  } = options;

  const opts = meta || getOptions(name, src);
  debug('%j', { name, src, dest });

  debugger;
  // const metalsmith = Metalsmith(path.join(src, 'template'));
  const metalsmith = Metalsmith(src);
  metalsmith.frontmatter(false);

  const data = Object.assign(metalsmith.metadata(), {
    name: kebabCase(npmName).replace(/^-/, ''),
    npmName: kebabCase(npmName).replace(/^-/, ''),
    className: uppercamelcase(name),
    kebabClassName: kebabCase(name).replace(/^-/, ''),
    inPlace: dest === process.cwd(),
    noEscape: true,
    registry: innerNet.getRegistry(npmName)
  });
  debug('%j', data);
  
  opts.helpers &&
    Object.keys(opts.helpers).map((key) => {
      Handlebars.registerHelper(key, opts.helpers[key]);
    });

  const helpers = { chalk, logger };

  if (opts.metalsmith && typeof opts.metalsmith.before === 'function') {
    opts.metalsmith.before(metalsmith, opts, helpers);
  }

  metalsmith
    .use(askQuestions(opts.prompts))
    .use(filterFiles(opts.filters))
    .use(renderTemplateFiles(opts.skipInterpolation))
    .use(transformFile(opts))
    .ignore([TEMPLATE_PATH, 'meta.js']);

  if (typeof opts.metalsmith === 'function') {
    opts.metalsmith(metalsmith, opts, helpers);
  } else if (opts.metalsmith && typeof opts.metalsmith.after === 'function') {
    opts.metalsmith.after(metalsmith, opts, helpers);
  }

  metalsmith
    .clean(false)
    .source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
    .destination(dest)
    .build((err, files) => {
      // 需要显性控制从物料 meta.js 中提取出来的 message 展现时机
      done(err, () => {
        if (typeof opts.complete === 'function') {
          const helpers = { chalk, logger, files };
          opts.complete(data, helpers);
        } else {
          logMessage(opts.completeMessage, data);
        }
      });
    });

  // 如果模板内部有 .template 目录, 不走 render 逻辑，直接拷贝
  const template = path.join(src, 'template', TEMPLATE_PATH);
  if (fs.existsSync(template)) {
    Metalsmith(template)
      .source('.')
      .destination(path.join(dest, TEMPLATE_PATH))
      .build(function(err){
        if (err) throw err;
      });
  }

  return data;
};

/**
 * Create a middleware for asking questions.
 *
 * @param {Object} prompts
 * @return {Function}
 */
function askQuestions(prompts) {
  return (files, metalsmith, done) => {
    ask(prompts, metalsmith.metadata(), done);
  };
}

function transformFile() {
  return (files, metalsmith, done) => {
    transform(files, metalsmith.metadata(), done);
  };
}

/**
 * Create a middleware for filtering files.
 *
 * @param {Object} filters
 * @return {Function}
 */
function filterFiles(filters) {
  return (files, metalsmith, done) => {
    filter(files, filters, metalsmith.metadata(), done);
  };
}

/**
 * Template in place plugin.
 *
 * @param {Object} files
 * @param {Metalsmith} metalsmith
 * @param {Function} done
 */
function renderTemplateFiles(skipInterpolation) {
  skipInterpolation =
    typeof skipInterpolation === 'string'
      ? [skipInterpolation]
      : skipInterpolation;

  return (files, metalsmith, done) => {
    const keys = Object.keys(files);
    const metalsmithMetadata = metalsmith.metadata();

    // HACK: need refactor
    Object.keys(metalsmithMetadata).forEach((key) => {
      if (key === 'type') {
        if (
          metalsmithMetadata[key]['react'] &&
          metalsmithMetadata[key]['vue']
        ) {
          metalsmithMetadata['materialType'] = ['react', 'vue'];
        } else if (metalsmithMetadata[key]['react']) {
          metalsmithMetadata['materialType'] = 'react';
        } else if (metalsmithMetadata[key]['vue']) {
          metalsmithMetadata['materialType'] = 'vue';
        }
      }
    });

    async.each(
      keys,
      (file, next) => {
        // skipping files with skipInterpolation option
        if (
          skipInterpolation &&
          multimatch([file], skipInterpolation, { dot: true }).length
        ) {
          return next();
        }
        const str = files[file].contents.toString();
        // do not attempt to render files that do not have mustaches
        if (!/{{([^{}]+)}}/g.test(str)) {
          return next();
        }

        render(str, metalsmithMetadata, (err, res) => {
          if (err) {
            err.message = `[${file}] ${err.message}`;
            return next(err);
          }
          files[file].contents = new Buffer(res);
          next();
        });
      },
      done
    );
  };
}

/**
 * Display template complete message.
 *
 * @param {String} message
 * @param {Object} data
 */
function logMessage(message, data) {
  if (!message) return;
  render(message, data, (err, res) => {
    if (err) {
      console.error(
        '\n   Error when rendering template complete message: ' +
          err.message.trim()
      );
    } else {
      console.log(
        '\n' +
          res
            .split(/\r?\n/g)
            .map((line) => '   ' + line)
            .join('\n')
      );
    }
  });
}
