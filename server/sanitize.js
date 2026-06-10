function sanitizeSession(session, role) {
  const base = {
    id: session.id,
    mode: session.mode,
    phase: session.phase,
    participants: session.participants.map(p => ({ id: p.id, role: p.role })),
    showInterviewer: session.showInterviewer,
  };

  switch (session.phase) {
    case 'waiting':
      return base;

    case 'subject_arrange':
      return {
        ...base,
        subjectOrder: role === 'subject' ? session.subject.order : null,
      };

    case 'interviewer_arrange':
      return {
        ...base,
        interviewerOrder: role === 'interviewer' ? session.interviewer.order : null,
      };

    case 'reveal':
      return {
        ...base,
        subjectOrder: session.subject.order,
        interviewerOrder: session.interviewer.order,
      };

    case 'phase2':
      return {
        ...base,
        subject: session.subject,
        interviewer: session.interviewer,
      };

    default:
      return base;
  }
}

module.exports = { sanitizeSession };
