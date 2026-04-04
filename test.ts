import { Command } from "commander";
import { ExposeCommand } from "./packages/expose/src/ExposeCommand.js";
const c = ExposeCommand.getCommand();
const p = new Command();
p.addCommand(c);
p.parse(["node", "bin", "expose", "-h"]);
