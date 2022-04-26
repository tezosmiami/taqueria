export const smartPyCompiledOutput = `
┌────────────────┬─────────────────┐
│ Contract       │ Artifacts       │
├────────────────┼─────────────────┤
│ hello-tacos.py │ HelloTacos_comp │
└────────────────┴─────────────────┘
`.trimStart()

export const compileMultipleContracts = `
┌────────────────┬─────────────────┐
│ Contract       │ Artifacts       │
├────────────────┼─────────────────┤
│ calculator.py  │ Calculator_comp │
├────────────────┼─────────────────┤
│ hello-tacos.py │ HelloTacos_comp │
└────────────────┴─────────────────┘
`.trimStart()

export const smartPyNothingCompiled = `No contracts found to compile.\n`