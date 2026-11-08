import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import {normalizeSceneState} from "./core.js?v=2.0.0";
const ID="com.onze1onze.sistema-iniciativa",KEY=ID+"/combatant",SCENE=ID+"/combat";
OBR.onReady(async()=>{try{
 await OBR.contextMenu.create({id:ID+"/combat-menu",icons:[
 {icon:"/Sistema-Iniciativa/icons/add.svg",label:"Adicionar como agente",filter:{every:[{key:"layer",value:"CHARACTER"},{key:"type",value:"IMAGE"},{key:["metadata",KEY],value:undefined}]}},
 {icon:"/Sistema-Iniciativa/icons/remove.svg",label:"Remover da iniciativa",filter:{every:[{key:"layer",value:"CHARACTER"},{key:["metadata",KEY],value:undefined,negate:true}]}}
 ],async onClick(context){
  const selected=context.items.filter(x=>x.layer==="CHARACTER"&&x.type==="IMAGE");if(!selected.length)return;
  if(selected.every(x=>Boolean(x.metadata?.[KEY]))){await OBR.scene.items.updateItems(selected.map(x=>x.id),items=>{for(const item of items){if(item.metadata)delete item.metadata[KEY];}});return;}
  const md=await OBR.scene.getMetadata(),scene=normalizeSceneState(md?.[SCENE]),now=Date.now();
  await OBR.scene.items.updateItems(selected.map(x=>x.id),items=>{for(const item of items){if(item.metadata?.[KEY])continue;item.metadata=item.metadata||{};item.metadata[KEY]={role:"AGENT",groupId:item.id,displayName:item.name||"Agente",agility:1,training:0,bonus:0,threatBonus:0,diceModifier:0,threatDice:2,initiative:null,roll:null,surprised:false,availableFromRound:scene.started?scene.round+1:1,conditions:[],note:"",addedAt:now};}});
 }
 });
}catch(e){console.error("OP menu contextual:",e);}});