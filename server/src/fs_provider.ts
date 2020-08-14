import {exists,promises} from "fs";
import {promisify} from "util";
import {sync} from "glob";
import {Connection} from "vscode-languageserver";

interface FsProvider{
  readFile:(path:string)=>Promise<string>
  exists:(path:string)=>Promise<boolean>
  isDirectory:(path: string)=> Promise<boolean>
  unlink:(path: string)=> Promise<void>
  readdir:(path: string)=> Promise<string[]>
  rmdir:(path: string)=> Promise<void>
  glob:(pattern:string)=>Promise<string[]>
}

const {readFile,lstat,unlink,rmdir,readdir} = promises;
let provider:FsProvider = {
  readFile:(path:string)=>readFile(path,{encoding:"utf-8"}),
  exists:promisify(exists),
  isDirectory:(path:string)=>lstat(path).then(s=>s.isDirectory()),
  unlink,
  rmdir,
  readdir,
  glob:async pattern=>sync(pattern,{nosort: true, nodir: true}),
};

export function registerProvider(connection:Connection){
  provider = {
    readFile:(path:string)=>connection.sendRequest("readFile",path),
    exists:path=>connection.sendRequest("unlink",path),
    isDirectory:path=>connection.sendRequest("exists",path),
    unlink:path=>connection.sendRequest("unlink",path),
    rmdir:path=>connection.sendRequest("rmdir",path),
    readdir:path=>connection.sendRequest("readdir",path),
    glob:pattern=>connection.sendRequest("glob",pattern),
  };
}

export const getProvider = ()=>provider;