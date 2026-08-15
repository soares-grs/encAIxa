import { describe, expect, it } from "vitest";
import { applyDecisions } from "./resume.js";
import type { Optimization, Profile } from "../shared/schemas.js";
const profile:Profile={name:"Gabriel",title:"Engenheiro",subtitle:"",contact:{email:"",phone:"",linkedin:"",github:"",location:""},summary:"Original",skills:["Java"],experience:[{title:"Dev",company:"X",period:"2024",bullets:["Bullet original"]}],education:[],languages:[]};
const analysis:Optimization={role:"Dev",company:"X",requirements:[],relevantSkills:[],gaps:[],suggestions:[{id:"s1",type:"summary",target:"summary",original:"Original",proposed:"Novo",reason:"Aderência",evidenceRefs:["summary"]},{id:"s2",type:"bullet",target:"experience.0.bullets.0",original:"Bullet original",proposed:"Bullet novo",reason:"Clareza",evidenceRefs:["experience.0.bullets.0"]}]};
describe("applyDecisions",()=>{it("aplica apenas sugestões aceitas sem alterar o perfil-base",()=>{const result=applyDecisions(profile,analysis,[{suggestionId:"s1",accepted:true},{suggestionId:"s2",accepted:false}]);expect(result.summary).toBe("Novo");expect(result.experience[0].bullets[0]).toBe("Bullet original");expect(profile.summary).toBe("Original")})});
