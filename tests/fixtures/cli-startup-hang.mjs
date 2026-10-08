// Deliberate live process: no parser, GPU, network or package dependencies.
if (process.argv.includes("--ready")) process.stdout.write('{"ready":true}\n')
process.stderr.write("CLI_STARTUP_DELIBERATE_HANG\n")
setInterval(() => {}, 1000)
