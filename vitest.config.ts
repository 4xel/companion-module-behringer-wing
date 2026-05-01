import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// *.integration.test.ts requires a live Wing — excluded from default run
		include: ['src/**/*.test.ts'],
		exclude: ['src/**/*.integration.test.ts'],
		environment: 'node',
	},
	resolve: {
		// Allow importing .js extensions that resolve to .ts in source
		extensions: ['.ts', '.js'],
	},
})
