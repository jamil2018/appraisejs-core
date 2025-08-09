const ModifyModule = ({ params }: { params: { id: string } }) => {
  const { id } = params;

  return (
    <div>
      <h1>Modify Module</h1>
      <p>Module ID: {id}</p>
    </div>
  );
};

export default ModifyModule;
