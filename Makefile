.PHONY: project
project:
	make build

.PHONY: install
install:
	npm install --prefer-offline --no-audit

.PHONY: test
test:
	./node_modules/.bin/jest --runInBand --passWithNoTests ----testNamePattern immer

.PHONY: build
build:
	make tsc

.PHONY: typecheck
typecheck:
	./node_modules/.bin/tsc --resolveJsonModule -p ./tsconfig.json --noEmit

.PHONY: tsc
tsc:
	./node_modules/.bin/tsc --resolveJsonModule -p ./tsconfig.json --outDir ./dist/esm
	./node_modules/.bin/tsc --resolveJsonModule -p ./tsconfig.json --module commonjs --outDir ./dist/cjs

