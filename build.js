#!/usr/bin/env node

/**
 * Build script for nuvio-torbox
 *
 * Bundles src/<provider>/ into a single Hermes-compatible file at providers/<provider>.js
 * (async/await is transpiled to generators, target es2016)
 *
 * Usage:
 *   node build.js            # Build all providers
 *   node build.js --minify   # Build with minification
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'providers');

const EXTERNAL_MODULES = [
    'cheerio-without-node-native',
    'react-native-cheerio',
    'cheerio',
    'crypto-js',
    'axios'
];

function getProvidersToBuild() {
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));

    if (args.length > 0) {
        return args;
    }

    if (!fs.existsSync(srcDir)) {
        console.error('src/ directory not found. Create provider folders in src/<provider>/');
        process.exit(1);
    }

    return fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
}

async function buildProvider(providerName, options = {}) {
    const providerDir = path.join(srcDir, providerName);
    const entryPoint = path.join(providerDir, 'index.js');
    const outFile = path.join(outDir, `${providerName}.js`);

    if (!fs.existsSync(entryPoint)) {
        console.warn(`Skipping ${providerName}: no src/${providerName}/index.js found`);
        return false;
    }

    try {
        await esbuild.build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outFile,
            format: 'cjs',
            platform: 'neutral',
            target: 'es2016',
            minify: options.minify || false,
            sourcemap: false,
            external: EXTERNAL_MODULES,
            banner: {
                js: `/**\n * ${providerName} - Built from src/${providerName}/\n * Generated: ${new Date().toISOString()}\n */`
            },
            logLevel: 'warning'
        });

        const stats = fs.statSync(outFile);
        const sizeKB = (stats.size / 1024).toFixed(1);
        const minifyIndicator = options.minify ? ' (minified)' : '';
        console.log(`OK ${providerName}.js (${sizeKB} KB)${minifyIndicator}`);
        return true;
    } catch (err) {
        console.error(`Failed to build ${providerName}:`, err.message);
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const shouldMinify = args.includes('--minify');
    const providers = getProvidersToBuild();

    if (providers.length === 0) {
        console.log('No providers found in src/ directory.');
        return;
    }

    const minifyLabel = shouldMinify ? ' (minified)' : '';
    console.log(`\nBuilding ${providers.length} provider(s)${minifyLabel}...\n`);

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    let success = 0;
    let failed = 0;

    for (const provider of providers) {
        const result = await buildProvider(provider, { minify: shouldMinify });
        if (result) success++;
        else failed++;
    }

    console.log(`\nDone! ${success} built, ${failed} skipped/failed\n`);
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});