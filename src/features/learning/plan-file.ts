export function validatePlanFileMetadata(name:string,size:number):void {
  if(!/\.(md|txt)$/i.test(name)) throw new Error('Выберите файл Markdown (.md) или текстовый файл (.txt).');
  if(size>120_000) throw new Error('Файл слишком большой: максимум 120 КБ. Сократите план перед импортом.');
}

export function validatePlanText(text:string):string {
  if(text.includes('\0')) throw new Error('Файл содержит бинарные данные. Выберите текстовый план.');
  if(text.length>60_000) throw new Error('В файле более 60 000 символов. Сократите план перед импортом.');
  if(text.trim().length<20) throw new Error('В файле слишком мало текста для учебного плана.');
  return text;
}
