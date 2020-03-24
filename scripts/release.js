#!/usr/bin/env node

const shell = require('shelljs');
const { existsSync } = require('fs');
const { signale, execa, yParser } = require('@umijs/utils');
const { join } = require('path');
const { fork } = require('child_process');

const lernaCli = require.resolve('lerna/cli');
const getPackages = require('./getPackages');
const syncTNPM = require('./syncTNPM');

if (!shell.exec('npm config get registry').stdout.includes('https://registry.npmjs.org/')) {
  console.error('Failed: set npm registry to https://registry.npmjs.org/ first');
  process.exit(1);
}
const args = yParser(process.argv.slice(2)) || {};

// exit by Ctrl/Cmd + C
process.on('SIGINT', () => {
  signale.info('exit build by user');
  process.exit(1);
});

const cwd = process.cwd();
const ret = execa.sync(lernaCli, ['changed']).stdout;
const updatedRepos = ret
  .split('\n')
  .map(line => line.replace('- ', ''))
  .filter(line => line !== '');

if (updatedRepos.length === 0) {
  console.log('No package is updated.');
  process.exit(0);
}

// Build
if (!args.skipBuild) {
  const { code: buildCode } = shell.exec('npm run build');
  if (buildCode === 1) {
    console.error('Failed: npm run build');
    process.exit(1);
  }
}

const cp = fork(join(process.cwd(), 'node_modules/.bin/lerna'), ['version'], {
  stdio: 'inherit',
  cwd: process.cwd(),
});
cp.on('error', err => {
  console.log(err);
});
cp.on('close', code => {
  console.log('code', code);
  if (code === 1) {
    console.error('Failed: lerna publish');
    process.exit(1);
  }
  publishToNpm();
  syncTNPM();
});

function publishToNpm() {
  const pkgMap = getPackages();
  console.log(`repos to publish: ${updatedRepos.join(', ')}`);
  updatedRepos.forEach(updatedPkg => {
    const { version, repo } = pkgMap.find(pkg => pkg.name === updatedPkg);
    shell.cd(join(cwd, 'packages', repo));
    if (version.includes('-rc.') || version.includes('-beta.') || version.includes('-alpha.')) {
      console.log(`[${repo}] npm publish --tag next`);
      shell.exec(`npm publish --tag next`);
    } else {
      console.log(`[${repo}] npm publish`);
      shell.exec(`npm publish`);
    }
  });
}
