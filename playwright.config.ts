import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
export default defineConfig({testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:90000,retries:0,reporter:'list',use:{baseURL:'http://localhost:3000',headless:true,channel:process.platform==='win32'?'msedge':undefined,viewport:{width:1440,height:1100},trace:'off',screenshot:'only-on-failure'}});
