//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

'use strict';

const path = require('path');
const { ProvidePlugin } = require('webpack');

const browserClientConfig = /** @type WebpackConfig */ {
	context: path.join(__dirname, 'client'),
	mode: 'none',
	target: 'webworker', // web extensions run in a webworker context
	entry: {
		client: './src/extension.ts',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'out-browser'),
		libraryTarget: 'commonjs',
	},
	resolve: {
		mainFields: ['module', 'main'],
		conditionNames: ['browser', 'node', 'require', 'module', 'webpack'],
		extensions: ['.ts', '.js'], // support ts-files and js-files
		alias: {},
		fallback: {
			"fs": false,
			"path": require.resolve("path-browserify"),
			"crypto": require.resolve("crypto-browserify"),
			"vm": require.resolve("vm-browserify")
		}
	},
	plugins: [
		new ProvidePlugin({
			Buffer: [require.resolve("buffer/"), "Buffer"],
			process: require.resolve("process/browser"),
		}),
	],
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: 'ts-loader',
					},
				],
			},
		],
	},
	externals: {
		vscode: 'commonjs vscode', // ignored because it doesn't exist
	},
	performance: {
		hints: false,
	},
	devtool: 'source-map',
};

const browserServerConfig = /** @type WebpackConfig */ {
	context: path.join(__dirname, 'server'),
	mode: 'none',
	target: 'webworker', // web extensions run in a webworker context
	entry: {
		server: './src/server.ts',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'out-browser'),
		libraryTarget: 'var',
		library: 'serverExportVar'
	},
	resolve: {
		mainFields: ['module', 'main'],
		conditionNames: ['browser', 'node', 'require', 'module', 'webpack'],
		extensions: ['.ts', '.js'], // support ts-files and js-files
		alias: {
			'./connection_node$': path.join(__dirname, 'server/src/connection_browser.ts'),
			glob: false,
		},
		fallback: {
			"path": require.resolve("path-browserify"),
			"crypto": require.resolve("crypto-browserify"),
			"vm": require.resolve("vm-browserify"),
			util: false,
			fs: false,
			os: false,
			assert: false
		},
	},
	plugins: [
		new ProvidePlugin({
			Buffer: [require.resolve("buffer/"), "Buffer"],
			process: require.resolve("process/browser"),
		}),
	],
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: 'ts-loader',
					},
				],
			},
		],
	},
	externals: {
		vscode: 'commonjs vscode', // ignored because it doesn't exist
	},
	performance: {
		hints: false,
	},
	devtool: 'source-map'
};

module.exports = [browserClientConfig, browserServerConfig];
