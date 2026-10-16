import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
dotenv.config({path:'../../.env',quiet:true});
process.env.NODE_ENV='test';
export default defineConfig({test:{include:['tests/**/*.test.ts'],testTimeout:30000,hookTimeout:30000,fileParallelism:false}});
