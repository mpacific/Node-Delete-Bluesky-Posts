// Newer Node strips TypeScript types natively and by default (Node 23.6+, and
// backported to Node 22.18+), which makes the test files load as ES modules and
// breaks proxyquire's CommonJS require. We disable that so ts-node's CommonJS
// hook handles .ts instead. The --no-experimental-strip-types flag only exists
// from Node 22.6, so it must NOT be passed on older versions (e.g. CI's Node
// 18/20), which reject it and don't strip types anyway.
const [major, minor] = process.versions.node.split('.').map(Number)
const needsStripTypesDisabled = major > 22 || (major === 22 && minor >= 6)

const config = {
  require: ['ts-node/register', 'source-map-support/register'],
  spec: 'test/**/*.ts',
  extension: ['ts'],
}

if (needsStripTypesDisabled) {
  config['node-option'] = ['no-experimental-strip-types']
}

module.exports = config
