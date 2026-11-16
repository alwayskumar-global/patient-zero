import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.spec.ts',timeout:30000,expect:{timeout:10000},workers:1,fullyParallel:false,use:{baseURL:'http://127.0.0.1:3000',headless:true,viewport:{width:1440,height:900},colorScheme:'dark',trace:'retain-on-failure'},reporter:'list'});
