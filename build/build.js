const rollup = require('rollup');
const JsonPlugin = require('@rollup/plugin-json');
const NodeResolvePlugin = require('@rollup/plugin-node-resolve');
const BabelPlugin = require('rollup-plugin-babel');
const TerserPlugin = require('rollup-plugin-terser'); // minify file
const path = require('path');
const fs = require('fs');
const package = require('../package.json');

const program = require('commander');
program.option('-w, --watch', 'Watch files change and build cjs, umd, esm')
program.parse(process.argv);

// The default entry is src/index.js or src/{package.name}.js
if (program.watch) {
  // watch
  watchFile()
} else {
  // build
  buildFile()
}

// No subdirectories; 不包含子目录
async function buildDir(inputDir, opt={}, eachOpt={}) {
  const files = fs.readdirSync(inputDir)
  .filter(item => {
    const filePath = path.join(inputDir, item)
    return fs.statSync(filePath).isFile() && (!opt.exclude || !opt.exclude(item, filePath))
  })
  for (const item of files) {
    const filePath = path.join(inputDir, item)
    const [name, suffix] = item.split('.')
    const pathWithoutSuffix = item.slice(0, item.length - 1 - suffix.length)
    await buildFile({
      input: filePath,
      moduleName: camelCase(name),
      outFileName: pathWithoutSuffix,
      ...eachOpt,
    })
  }
}
// No subdirectories; 不包含子目录
function watchDir(inputDir, opt={}, eachOpt={}) {
  const files = fs.readdirSync(inputDir)
  .filter(item => {
    const filePath = path.join(inputDir, item)
    return fs.statSync(filePath).isFile() && (!opt.exclude || !opt.exclude(item, filePath))
  })
  for (const item of files) {
    const filePath = path.join(inputDir, item)
    const [name, suffix] = item.split('.')
    const pathWithoutSuffix = item.slice(0, item.length - 1 - suffix.length)
    watchFile({
      input: filePath,
      moduleName: camelCase(name),
      outFileName: pathWithoutSuffix,
      ...eachOpt,
    })
  }
}

async function buildFile(opt={}) {
  opt = {
    input: get_default_input(),
    moduleName: camelCase(package.name),
    outFileName: package.name, // without suffix
    outputDir: './dist',
    formats: ['cjs', 'esm', 'umd', 'umd.min'],
    plugins: [
      ...getDefaultPlugins(),
      ...opt.plugins || [],
    ],
    ...opt,
  }
  //
  for (const format of opt.formats) {
    const inputOptions = {
      input: opt.input,
      plugins: [...opt.plugins],
    }
    const outputOptions = {
      format: format,
      name: opt.moduleName,
      exports: 'named', // reason: Entry module "xxx.js" is using named and default exports together. Consumers of your bundle will have to use `helperJs["default"]` to access the default export, which may not be what you want. Use `output.exports: "named"` to disable this warning
    }
    if (opt.banner !== false) {
      if (typeof opt.banner === 'string') {
        outputOptions.banner = opt.banner
      } else {
        outputOptions.banner = `
/*!
* ${package.name} v${package.version}
* (c) ${package.author}
* Released under the ${package.license} License.
*/`.trim()
      }
    }
    switch (format) {
      case 'umd':
        outputOptions.file = path.join(opt.outputDir, `${opt.outFileName}.js`)
        break;
      case 'umd.min':
        inputOptions.plugins.push(TerserPlugin.terser())
        outputOptions.format = 'umd'
        outputOptions.file = path.join(opt.outputDir, `${opt.outFileName}.min.js`)
        outputOptions.sourcemap = true
        break;
      default:
        outputOptions.file = path.join(opt.outputDir, `${opt.outFileName}.${format}.js`)
    }
    const bundle = await rollup.rollup(inputOptions)
    // generate code
    const { output } = await bundle.generate(outputOptions)
    await bundle.write(outputOptions)
    // get size
    const stats = fs.statSync(outputOptions.file)
    const sizeKIB = stats["size"] / 1024
    console.log(`Done: ${outputOptions.file} ${sizeKIB.toFixed(2)}KB`);
  }
}

async function watchFile(opt={}) {
  opt = {
    input: get_default_input(),
    moduleName: camelCase(package.name),
    outFileName: package.name, // without suffix
    outputDir: './dist',
    formats: ['cjs', 'esm', 'umd'],
    plugins: [
      ...getDefaultPlugins(),
      ...opt.plugins || [],
    ],
    ...opt,
  }
  const inputOptions = {
    input: opt.input,
    plugins: [...opt.plugins],
  }
  const outputOptionsArr = []
  //
  for (const format of opt.formats) {
    const outputOptions = {
      format: format,
      name: opt.moduleName,
      exports: 'named', // reason: Entry module "xxx.js" is using named and default exports together. Consumers of your bundle will have to use `helperJs["default"]` to access the default export, which may not be what you want. Use `output.exports: "named"` to disable this warning
    }
    outputOptionsArr.push(outputOptions)
    switch (format) {
      case 'umd':
        outputOptions.file = path.join(opt.outputDir, `${opt.outFileName}.js`)
        break;
      case 'umd.min':
        inputOptions.plugins.push(TerserPlugin.terser())
        outputOptions.format = 'umd'
        outputOptions.file = path.join(opt.outputDir, `${opt.outFileName}.min.js`)
        outputOptions.sourcemap = true
        break;
      default:
        outputOptions.file = path.join(opt.outputDir, `${opt.outFileName}.${format}.js`)
    }
  }
  const watchOptions = {
    ...inputOptions,
    output: outputOptionsArr,
    // watch: {
    //   chokidar,
    //   clearScreen,
    //   exclude,
    //   include
    // }
  };
  console.log(`Start to watch ${inputOptions.input}`);
  const watcher = rollup.watch(watchOptions);
  watcher.on('event', event => {
    if (['ERROR', 'FATAL'].includes(event.code)) {
      console.log('error', '======================================================');
      console.log(event.error);
    }
    if (['BUNDLE_END'].includes(event.code)) {
      console.log('success', '======================================================');
      console.log(event);
    }
    // event.code can be one of:
    //   START        — the watcher is (re)starting
    //   BUNDLE_START — building an individual bundle
    //   BUNDLE_END   — finished building a bundle
    //   END          — finished building all bundles
    //   ERROR        — encountered an error while bundling
    //   FATAL        — encountered an unrecoverable error
  });
}

function get_default_input() {
  let input = './src/index.js'
  if (!fs.existsSync(input)) {
    input = `./src/${package.name.js}`
  }
  return input
}
function getDefaultPlugins() {
  const defaultPlugins = [
    JsonPlugin(),
    NodeResolvePlugin(),
    BabelPlugin({
      exclude: 'node_modules/**' // only transpile our source code
    }),
  ];
  try {
    const VuePlugin = require('rollup-plugin-vue');
    defaultPlugins.push(VuePlugin())
    console.log('rollup-plugin-vue is auto enabled because it is existing.');
  } catch (e) {}
  return defaultPlugins
}
function studlyCase (str) {
  return str && (str[0].toUpperCase() + str.substr(1))
}
function camelCase (str) {
  const temp = str.toString().split(/[-_]/)
  for (let i = 1; i < temp.length; i++) {
    temp[i] = studlyCase(temp[i])
  }
  return temp.join('')
}
