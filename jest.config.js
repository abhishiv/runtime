module.exports = {
	testEnvironment: "node",
	reporters: ["default"],
	setupFiles: [],
	transformIgnorePatterns: ["node_modules"],
	modulePathIgnorePatterns: ["__mocks__", "__fixtures__", "dist"],
	testPathIgnorePatterns: [
		"<rootDir>/packages/hq",
		"<rootDir>/node_modules",
		"<rootDir>/dist",
		"<rootDir>/packages/ts-simple-type",
		"<rootDir>/packages/codesense/src/__tests__/__fixtures__",
		"<rootDir>/packages/hub/src/e2e",
		"<rootDir>/packages/*/dist",
		"<rootDir>/packages/shell/src/public/bundles",
	],
};
