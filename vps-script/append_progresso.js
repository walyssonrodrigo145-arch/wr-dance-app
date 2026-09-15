const fs = require('fs');
const file = './client/src/pages/student/Progresso.tsx';

const newReturn = `
  const studentName = dashboardData?.student?.name || "Aluno";
  const firstName = studentName.split(" ")[0];
  const lastName = studentName.split(" ").slice(1).join(" ");
  const lessonsDone = dashboardData?.statsDone?.count || 0;
  
  // Como nao temos lastLessonDate na api do student de forma rapida no dashboard, vamos mockar ou usar data atual se houver aula
  const lastLessonDate = "27 Jun"; 
  const lastLessonDayName = "Quinta-feira";
  const level = "INICIANTE";
  
  const totalDays = planData?.days?.length || 1;
  const safeDayIndex = Math.min(selectedDay, totalDays - 1);
  const currentDayData = planData?.days[safeDayIndex];
  const isCurrentDayCompleted = planData ? Boolean(daysCompleted[safeDayIndex]) : false;
  const isPlanFinished = activePlan?.status === "inativo";

  const handleToggleDay = (markAs) => {
    if (isPlanFinished || toggleDayMutation.isPending || !activePlan) return;
    if (markAs !== isCurrentDayCompleted) {
      toggleDayMutation.mutate({ planId: activePlan.id, dayIndex: safeDayIndex });
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans text-slate-800 subtle-scrollbar overflow-x-hidden">
      {/* Modal de Detalhes */}
      <ExerciseDetailModal
        exercise={selectedExercise}
        dayFocus={currentDayData?.focus?.title}
        onClose={() => setSelectedExercise(null)}
      />

      {/* Header Mobile */}
      <div className="pt-6 px-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full bg-white shadow-sm hover:bg-slate-100" onClick={() => window.history.back()}>
            <ChevronLeft size={20} className="text-slate-600" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-md">
                {firstName.substring(0,2).toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                <PenTool size={10} className="text-slate-500" />
              </div>
            </div>
            <div className="flex flex-col">
              <h2 className="font-bold text-slate-800 text-lg leading-tight truncate max-w-[130px]">{firstName} {lastName}</h2>
              <span className="text-xs text-slate-500 font-medium">MusicPro Estudante</span>
            </div>
          </div>

          <Button size="icon" className="w-10 h-10 rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700">
            <Plus size={20} />
          </Button>
        </div>
      </div>

      {/* Card Nível e Frequência */}
      <div className="px-6 mt-6">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                <Star size={12} className="fill-indigo-600" />
                <span className="text-[10px] font-black tracking-widest uppercase">{level}</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1.5 font-bold uppercase tracking-widest">Nível atual</span>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">FREQUÊNCIA</span>
              <span className="text-2xl font-black text-indigo-600 leading-none">100%</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-1.5">
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="w-full h-full bg-indigo-600 rounded-full" />
            </div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center mt-1">Parabéns! Continue assim!</p>
          </div>
        </div>
      </div>

      {/* Grid 4 cards horizontally scrolling */}
      <div className="px-6 mt-6 flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-6 px-6">
         <div className="min-w-[115px] bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col items-start gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center"><Star size={16} className="text-amber-500 fill-amber-500/20" /></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MÉDIA GERAL</span>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-black text-slate-800">10.0</span>
            </div>
         </div>
         <div className="min-w-[115px] bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col items-start gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center"><BookOpen size={16} className="text-indigo-500" /></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">AULAS</span>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-black text-slate-800">{lessonsDone}</span>
            </div>
         </div>
         <div className="min-w-[115px] bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col items-start gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center"><CalendarDays size={16} className="text-rose-500" /></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ÚLTIMA AULA</span>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-black text-slate-800">{lastLessonDate}</span>
            </div>
         </div>
         <div className="min-w-[115px] bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col items-start gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><Flame size={16} className="text-emerald-500 fill-emerald-500/20" /></div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SEQUÊNCIA</span>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-black text-slate-800">7 dias</span>
            </div>
         </div>
      </div>

      {/* Fogo banner */}
      <div className="px-6 mt-4">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <Flame size={20} className="text-orange-500 fill-orange-500" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800">Você está em uma ótima sequência!</h4>
              <p className="text-[10px] text-slate-500 font-medium">7 dias praticando sem parar.</p>
            </div>
          </div>
          <div className="bg-indigo-600 text-white rounded-full px-3 py-2 flex items-center gap-1.5 shrink-0 shadow-md shadow-indigo-600/20">
            <Trophy size={14} className="fill-white" />
            <span className="text-[10px] font-bold">7 dias</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8 border-b border-slate-200">
        <div className="flex items-center gap-6 px-6 overflow-x-auto no-scrollbar">
          {["JORNADA", "BIBLIOTECA", "NOTAS", "METAS"].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-3 text-[10px] font-black tracking-widest flex items-center gap-1.5 transition-colors relative whitespace-nowrap",
                activeTab === tab ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {tab === "JORNADA" && <Activity size={14} />}
              {tab === "BIBLIOTECA" && <Folder size={14} />}
              {tab === "NOTAS" && <BookOpen size={14} />}
              {tab === "METAS" && <Target size={14} />}
              {tab}
              {activeTab === tab && (
                <motion.div layoutId="activeTabStudent" className="absolute bottom-0 left-0 right-0 h-[3px] bg-indigo-600 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 mt-6">
        <AnimatePresence mode="wait">
          {activeTab === "JORNADA" && (
            <motion.div key="jornada" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
               {!activePlan || !planData ? (
                 <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-100 rounded-3xl shadow-sm mt-4">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-50 flex items-center justify-center mb-4">
                      <BookOpen size={28} className="text-indigo-400" />
                    </div>
                    <h3 className="text-sm font-black tracking-tight text-slate-800 mb-2 uppercase">Nenhum plano ativo</h3>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-6">
                      O seu professor ainda não gerou o seu plano de estudos para esta semana.
                    </p>
                    <Button onClick={handleContactProfessor} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs h-10 w-full shadow-lg shadow-indigo-600/20">
                      <MessageCircle size={14} className="mr-2" /> Falar com o professor
                    </Button>
                 </div>
               ) : (
                 <>
                   {/* Title Plano Diario Ativo */}
                   <div className="flex items-center justify-between mb-5">
                     <div className="flex items-center gap-2.5">
                       <div className="w-1.5 h-4 bg-orange-500 rounded-full" />
                       <h3 className="text-xs font-black text-slate-900 tracking-widest uppercase">Plano Diário Ativo</h3>
                     </div>
                     <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-[9px] font-black tracking-widest uppercase">
                       PUBLICADO
                     </div>
                   </div>

                   {/* Target Card */}
                   <div className="bg-indigo-50/50 rounded-3xl p-5 border border-indigo-100 flex items-start gap-4 mb-4 relative overflow-hidden shadow-sm">
                      <Target className="absolute -right-4 -bottom-4 w-28 h-28 text-indigo-500/10 stroke-[1]" />
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center shrink-0 shadow-md">
                         <Target size={18} className="text-white" />
                      </div>
                      <div className="relative z-10">
                         <h4 className="text-[10px] font-black text-indigo-600 tracking-widest uppercase mb-1">OBJETIVO DA SEMANA</h4>
                         <p className="text-[11px] text-slate-700 font-bold leading-relaxed">
                           {planData.weeklyGoal || "Treinar com foco e dedicação!"}
                         </p>
                      </div>
                   </div>

                   {/* Dia Selector */}
                   <div className="bg-white border border-slate-100 rounded-3xl p-4 flex items-center justify-between shadow-sm mb-4">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={16} className="text-indigo-600" />
                        <span className="text-[11px] font-black uppercase text-slate-800 tracking-widest">
                          {currentDayData?.dayName || \`Dia \${safeDayIndex + 1}\`}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 shadow-sm" onClick={() => setSelectedDay(Math.max(0, selectedDay-1))}>
                          <ChevronLeft size={16} className="text-slate-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 shadow-sm" onClick={() => setSelectedDay(Math.min(planData.days.length-1, selectedDay+1))}>
                          <ChevronRight size={16} className="text-slate-600" />
                        </Button>
                      </div>

                      <div className="flex flex-col gap-1 w-24">
                        <div className="flex justify-between">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Progresso</span>
                          <span className="text-[9px] font-black text-indigo-600">{Math.round((daysCompleted.filter(Boolean).length / planData.days.length) * 100)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full" style={{ width: \`\${Math.round((daysCompleted.filter(Boolean).length / planData.days.length) * 100)}%\` }} />
                        </div>
                      </div>
                   </div>

                   {/* Foco do dia */}
                   <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm mb-6">
                      <div className="flex items-start justify-between gap-4 mb-5">
                         <div className="flex gap-4 items-center">
                           <div className="w-12 h-12 rounded-[1rem] bg-indigo-50 flex items-center justify-center shrink-0">
                              <Music size={20} className="text-indigo-600" />
                           </div>
                           <div className="flex flex-col">
                             <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">FOCO DO DIA</p>
                             <h2 className="text-sm font-black text-slate-800 leading-tight">
                               {currentDayData?.focus?.title || "Praticar"}
                             </h2>
                           </div>
                         </div>
                         
                         <div className="flex flex-col gap-1.5 shrink-0 items-end">
                           <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                             <Timer size={10} /> 20 MIN
                           </div>
                           <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                             <div className="flex gap-0.5 items-end h-2.5">
                               <div className="w-1 h-1.5 bg-emerald-500 rounded-full" />
                               <div className="w-1 h-2 bg-emerald-500 rounded-full" />
                               <div className="w-1 h-2.5 bg-emerald-300 rounded-full" />
                             </div>
                             AVANÇADO
                           </div>
                         </div>
                      </div>
                      
                      <Button 
                         className={cn(
                           "w-full h-12 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg",
                           isCurrentDayCompleted
                             ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                             : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20"
                         )}
                         onClick={() => handleToggleDay(true)}
                         disabled={toggleDayMutation.isPending}
                      >
                         {isCurrentDayCompleted ? (
                           <><CheckCircle2 size={16} className="fill-emerald-100" /> TREINO CONCLUÍDO</>
                         ) : (
                           <><Play size={16} className="fill-white" /> COMEÇAR TREINO</>
                         )}
                      </Button>
                   </div>
                   
                   {/* Exercícios List */}
                   {currentDayData?.exercises && currentDayData.exercises.length > 0 && (
                     <div className="mt-6 flex flex-col gap-3">
                        <h4 className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2">Exercícios de hoje</h4>
                        {currentDayData.exercises.map((ex, idx) => (
                           <div key={idx} className="bg-white border border-slate-100 rounded-3xl p-4 flex flex-col md:flex-row gap-4 shadow-sm items-start md:items-center">
                             <div className="flex gap-4 items-center flex-1">
                               <div className="w-12 h-12 bg-indigo-50 rounded-[1rem] flex items-center justify-center shrink-0">
                                 <ExerciseIcon icon={ex.icon} />
                               </div>
                               <div className="flex-1">
                                 <h3 className="font-bold text-sm text-slate-800">{ex.title}</h3>
                                 {ex.subtitle && <p className="text-[11px] text-slate-500 font-medium mt-0.5">{ex.subtitle}</p>}
                                 {ex.duration && (
                                   <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 mt-2 bg-slate-50 w-fit px-2 py-0.5 rounded-md uppercase tracking-widest">
                                     <Timer size={10} /> {ex.duration}
                                   </div>
                                 )}
                               </div>
                             </div>
                             
                             <Button
                               variant="ghost"
                               className="w-full md:w-auto h-10 text-[10px] text-indigo-600 hover:text-indigo-700 font-black hover:bg-indigo-50 rounded-xl uppercase tracking-widest"
                               onClick={() => setSelectedExercise(ex)}
                             >
                               Ver detalhes &gt;
                             </Button>
                           </div>
                        ))}
                     </div>
                   )}

                   {/* Banner Importante */}
                   {planData?.importantMessage && (
                     <div className="mt-8 bg-violet-50/50 border border-violet-100 p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
                       <div className="flex gap-4 items-center">
                         <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-violet-500 shadow-sm shrink-0">
                           <Award size={18} />
                         </div>
                         <div>
                           <h4 className="font-bold text-[11px] uppercase tracking-widest text-violet-900 mb-0.5">Importante</h4>
                           <p className="text-[11px] text-violet-700/80 font-medium">{planData.importantMessage}</p>
                         </div>
                       </div>
                     </div>
                   )}
                 </>
               )}
            </motion.div>
          )}

          {activeTab !== "JORNADA" && (
            <motion.div key="other" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col items-center justify-center text-center p-12 bg-white border border-slate-100 rounded-3xl shadow-sm mt-4">
               <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-50 flex items-center justify-center mb-4">
                 <Loader2 size={28} className="text-indigo-400" />
               </div>
               <h3 className="text-sm font-black tracking-tight text-slate-800 mb-2 uppercase">Em breve</h3>
               <p className="text-[11px] text-slate-500 leading-relaxed max-w-[200px]">
                 Esta aba ainda está em construção e estará disponível em breve.
               </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
`;

fs.appendFileSync(file, newReturn);
console.log('Appended layout to StudentProgress');
