import type{CorrelationRule,RuleSetting}from"./types";import{correlationRules}from"./rules";
export function createRuleRegistry(rules:CorrelationRule[]){const map=new Map<string,CorrelationRule>();for(const rule of rules){if(!Number.isInteger(rule.version)||rule.version<1)throw new Error(`Unsupported rule version for ${rule.key}.`);if(map.has(rule.key))throw new Error(`Duplicate correlation rule: ${rule.key}`);map.set(rule.key,rule)}return map}
export const ruleRegistry=createRuleRegistry(correlationRules);
export function enabledRules(settings:Record<string,RuleSetting>={}){return correlationRules.filter(rule=>settings[rule.key]?.enabled!==false)}
export const applies=(rule:CorrelationRule,source:string,target:string)=>rule.providers[0]===source&&rule.providers[1]===target;
