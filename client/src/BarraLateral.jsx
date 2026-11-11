import { Botao } from "./componentes/Botao.jsx";
import { Icone } from "./componentes/Icone.jsx";
import { ListaTickets } from "./Atendimento.jsx";

/** Lateral com a navegação entre áreas e, abaixo, a lista da área aberta (quadros ou tickets). */
export function BarraLateral({
  tela, aoTrocarTela,
  quadros, quadroId, aoSelecionar, aoNovoQuadro, aoRenomear, aoExcluir,
  atendimento,
}) {
  return (
    <aside className="lateral" aria-label={tela === "atendimento" ? "Atendimento" : "Quadros"}>
      <a className="marca" href="/" aria-label="Fluxo, voltar ao início" style={{ textDecoration: "none" }}>
        <span className="marca-simbolo" aria-hidden="true">
          <Icone nome="colunas" tamanho={18} />
        </span>
        <span className="marca-nome">Fluxo</span>
      </a>

      <nav className="lateral-nav" aria-label="Áreas do sistema">
        <button type="button" className="lateral-nav-item" aria-current={tela === "quadros" ? "page" : undefined} onClick={() => aoTrocarTela("quadros")}>
          <Icone nome="colunas" tamanho={18} />
          Quadros
        </button>
        <button type="button" className="lateral-nav-item" aria-current={tela === "atendimento" ? "page" : undefined} onClick={() => aoTrocarTela("atendimento")}>
          <Icone nome="suporte" tamanho={18} />
          Atendimento
        </button>
      </nav>

      {tela === "atendimento" ? (
        <ListaTickets
          tickets={atendimento.tickets}
          ticketId={atendimento.ticketId}
          aoSelecionar={atendimento.selecionar}
          aoNovo={atendimento.novo}
        />
      ) : (
        <>
          <div className="lateral-topo">
            <h2 className="lateral-titulo">Quadros</h2>
            <Botao variante="fantasma" icone="mais" aria-label="Criar quadro" onClick={aoNovoQuadro} />
          </div>

          {quadros === null ? (
            <p className="lateral-vazio">Carregando quadros…</p>
          ) : quadros.length ? (
            <ul className="lateral-lista">
              {quadros.map((quadro) => (
                <li key={quadro.id}>
                  <div className="lateral-item" data-ativo={quadro.id === quadroId ? "" : undefined}>
                    <button
                      type="button"
                      className="lateral-escolha"
                      aria-current={quadro.id === quadroId ? "page" : undefined}
                      onClick={() => aoSelecionar(quadro.id)}
                    >
                      {quadro.title}
                    </button>
                    <span className="lateral-acoes">
                      <Botao variante="fantasma" icone="lapis" aria-label={`Renomear quadro ${quadro.title}`} onClick={() => aoRenomear(quadro)} />
                      <Botao variante="fantasma" icone="lixeira" aria-label={`Excluir quadro ${quadro.title}`} onClick={() => aoExcluir(quadro)} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lateral-vazio">Nenhum quadro ainda. Crie o primeiro para começar.</p>
          )}
        </>
      )}
    </aside>
  );
}
