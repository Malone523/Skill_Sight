import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { conversationHistory, employeeName, employeeRole, targetRole, existingSkills } = await req.json();

    const transcript = (conversationHistory || [])
      .filter((m: any) => m.role !== "system")
      .map((m: any) => `${m.role === "user" ? employeeName : "SkillSight AI"}: ${m.content}`)
      .join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":
          "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",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        temperature: 0.1,
        max_tokens: 2000,
        system: `You are a skills extraction system. Read interview transcripts and extract demonstrated skills.
    Proficiency: 1=used with guidance, 2=completed independently, 3=led/designed/taught.
    Only extract if employee used action words like: built, implemented, designed, led, wrote, created, delivered, solved, developed, optimised, analysed, managed.
    Do NOT extract skills they mentioned wanting to learn or that their team uses without personal involvement.
    Match to these skill names where possible: ThermalEngineering, CAD, FEA, MechanicalDesign, SimulationModeling, ManufacturingProcesses, Python, CppLanguage, ROS, CloudAWS, MLOps, MachineLearning, DeepLearning, DataEngineering, Statistics, ComputerVision, NLP, EVBatterySystems, BatteryThermalMgmt, CellChemistry, HighVoltageSystems, GenSixArchitecture, BatteryManagementSystems, AUTOSAR, FunctionalSafety, ADAS, EmbeddedSystems, ProjectManagement, TeamLeadership, StakeholderManagement, CrossFunctional, TechnicalMentoring, DigitalTwin, AQIXQualityAI, SixSigma, PowerElectronics, V2XCommunication, CANBus.
    Return ONLY valid JSON with this exact structure:
    {"extracted_skills":{"SkillName":{"proficiency":2,"evidence":"short quote","confidence":"high"}},"new_skills_discovered":["SkillName"],"interview_summary":"2-3 sentences about what stood out"}`,
        messages: [
          {
            role: "user",
            content: `Employee: ${employeeName}, ${employeeRole}\nTarget Role: ${targetRole}\nExisting HR Skills: ${JSON.stringify(existingSkills || {})}\n\nTranscript:\n${transcript}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/);
    const interpreted = match ? JSON.parse(match[0]) : null;

    return new Response(JSON.stringify({ interpreted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
