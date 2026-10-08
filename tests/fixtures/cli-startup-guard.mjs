// Async loader registration supported by the Node 20 tsx test runtime.
// Unlike registerHooks, this does not require Node 22.15+/26.
import { register } from "node:module"
register("./cli-startup-loader.mjs", import.meta.url)
