#!/usr/bin/env node
import { dispatch } from './dispatch.ts';

process.exitCode = await dispatch(process.argv.slice(2));
