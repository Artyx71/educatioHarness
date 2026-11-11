const rules=new Intl.PluralRules('ru');

export function ruCount(count:number,one:string,few:string,many:string):string {
  const form=rules.select(count);
  return `${count} ${form==='one'?one:form==='few'?few:many}`;
}
