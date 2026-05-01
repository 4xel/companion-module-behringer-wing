import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const base = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...base,
	{
		files: ['**/*.test.ts', '**/*.integration.test.ts', 'vitest.config.ts', 'vitest.integration.config.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
