class my_class():
  def __init__(self) -> None:
    self.my_attribute = 0
      
  def set_my_attribute(self, new_value):
    self.my_attribute = new_value
    
my_instance = my_class()
print(type(my_instance))

print(my_instance.my_attribute)
my_instance.set_my_attribute(1)
print(my_instance.my_attribute)



def empiler(x):
    pile.append(x)
    
def depiler():
    return pile.pop()

# Création d'une pile vide
pile = []

# Empilage de 3 livres
empiler({'auteur': 'George Orwel', 'titre': '1984', 'annee': 1949})
empiler({'auteur': 'Isaac Asimov', 'titre': 'I, Robot', 'annee': 1950})
empiler({'auteur': 'Jules Verne', 'titre': 'Vingt mille lieues sous les mers', 'annee': 1869}) 

# Affichage de la pile
print(pile)

# Dépilage d'un livre et affichage du titre
x = depiler()
print(x['titre'])

# Affichage de la pile
print(pile)

# Empilage d'un nouveau livre
empiler({'auteur': 'Frank Herbert', 'titre': 'Dune', 'annee': 1965})

# Affichage de la pile
print(pile)