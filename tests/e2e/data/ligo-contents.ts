export const compileNonExistent = `
┌────────────┬──────────────┐
│ Contract   │ Artifact     │
├────────────┼──────────────┤
│ test.mligo │ Not compiled │
└────────────┴──────────────┘
`.trimStart()

export const compileInvalid = `
┌────────────────────────┬──────────────┐
│ Contract               │ Artifact     │
├────────────────────────┼──────────────┤
│ invalid-contract.mligo │ Not compiled │
└────────────────────────┴──────────────┘
`.trimStart()

export const compileHelloTacos = `
┌───────────────────┬──────────────────────────┐
│ Contract          │ Artifact                 │
├───────────────────┼──────────────────────────┤
│ hello-tacos.mligo │ artifacts/hello-tacos.tz │
└───────────────────┴──────────────────────────┘
`.trimStart()

export const compileTwoHelloTacos = `
┌───────────────────────┬──────────────────────────────┐
│ Contract              │ Artifact                     │
├───────────────────────┼──────────────────────────────┤
│ hello-tacos-one.mligo │ artifacts/hello-tacos-one.tz │
├───────────────────────┼──────────────────────────────┤
│ hello-tacos-two.mligo │ artifacts/hello-tacos-two.tz │
└───────────────────────┴──────────────────────────────┘
`.trimStart()