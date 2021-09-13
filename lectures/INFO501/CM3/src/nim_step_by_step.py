'''
File: nim_step_by_step.py
Created Date: Monday September 13th 2021 - 01:22pm
Author: Ammar Mian
Contact: ammar.mian@univ-smb.fr
-----
Last Modified: Mon Sep 13 2021
Modified By: Ammar Mian
-----
Copyright (c) 2021 Université Savoie Mont-Blanc
-----
Ce programme illustre une implémentation petit à petit du jeu de Nim dans le cadre 
d'un cours d'introduction à la programmation donné à Polytech Annecy-Chambéry.
Il ne s'agit pas d'un programme fonctionnel en tant que tel mais donne des exemples
de code qui sont les briques de base nécéssaire à la construction d'un programme qui
permettrait de jouer au jeu de Nim en pratique.
'''


# -----------------------------------------------
# 1 - Stocker le nombre de batonnets restants
# -----------------------------------------------
nombre_batonnets = 12

# -------------------------------------------------
# 2 - Affichage du nombre de batonnets restants v1
# -------------------------------------------------
print("Il y a ", nombre_batonnets, "restants")

# -----------------------------------------------
# 3 - Prendre un nombre de batonnets du joueur
# -----------------------------------------------
nombre_pris = int(input("Entrez un nombre de bâtonnets : "))

# -----------------------------------------------
# 4 - Vérifier que le nombre bâtonners est le bon
# -----------------------------------------------
if nombre_pris <=0 or nombre_pris>3:
    print("Le nombre de bâtonnets à prendre n'est pas correct !")
    print('Choisir une valeur entre 1 et 3.')
    nombre_pris = int(input("Entrez un nombre de bâtonnets : "))

# ------------------------------------------------------------------------
# 5 - Enlever le nombre de batonnets demandé au nombre de batonnets total
# ------------------------------------------------------------------------
nombre_batonnets = nombre_batonnets - nombre_pris
# OU plus court : nombre_batonnets -= nombre_pris

# -----------------------------
# 6 - Condition d'arrêt du jeu
# -----------------------------
if nombre_batonnets <= 0:
    print("Félicitations !! Vous avez gagné !")

# ------------------------------------------------------------------------
# 7 - Vérifier que le nombre bâtonners est le bon v2 avec prise en 
# compte du nombre de bâtonnets restant
# ------------------------------------------------------------------------
if (nombre_pris <=0 or nombre_pris>min(3, nombre_batonnets)):
    print("Le nombre de bâtonnets à prendre n'est pas correct !")
    print('Choisir une valeur entre 1 et ', min(3, nombre_batonnets), '.')
    nombre_pris = int(input("Entrez un nombre de bâtonnets :"))

nombre_batonnets -= nombre_pris

if nombre_batonnets == 0:
    print("Félicitations !! Vous avez gagné !")

# ------------------------------------------------------------------------
# 7 - Fonction pour prendre le choix et vérifier les condiitons sans 
# prise en compte du numéro du joueur
# ------------------------------------------------------------------------
def choix_joueur(nombre_batonnets):
    nombre_pris = int(input("Entrez un nombre de bâtonnets : "))

    # Il faudrait une répétition mais ça on verra après !
    if (nombre_pris <=0 or nombre_pris>min(3, nombre_batonnets)):
        print("Le nombre de bâtonnets à prendre n'est pas correct !")
        print('Choisir une valeur entre 1 et ', min(3, nombre_batonnets), '.')
        nombre_pris = int(input("Entrez un nombre de bâtonnets :"))

    return nombre_pris

# ------------------------------------------------------------------------
# 8 - Fonction pour faire un tour de jeu avec prise en compte joueur
# ------------------------------------------------------------------------
def tour_jeu(no_joueur, nombre_batonnets):
    print("Joueur no.", no_joueur)
    nombre_pris = choix_joueur(nombre_batonnets)

    nombre_batonnets -= nombre_pris
    if nombre_batonnets == 0:
        print("Félicitations !! Vous avez gagné !")
        return 0
    else:
        print("Il reste ", nombre_batonnets, "batonnets.")
        return nombre_batonnets


nombre_batonnets = 12
nombre_batonnets = tour_jeu(1, nombre_batonnets)
nombre_batonnets = tour_jeu(2, nombre_batonnets)

# ------------------------------------------------------------------------
# 9 - Maintenant qu'on a les boucles on peut changer choix_joueur
# ------------------------------------------------------------------------
def choix_joueur(nombre_batonnets):
    nombre_pris = int(input("Entrez un nombre de bâtonnets : "))

    # Il faudrait une répétition mais ça on verra après !
    while (nombre_pris <=0 or nombre_pris>min(3, nombre_batonnets)):
        print("Le nombre de bâtonnets à prendre n'est pas correct !")
        print('Choisir une valeur entre 1 et ', min(3, nombre_batonnets), '.')
        nombre_pris = int(input("Entrez un nombre de bâtonnets :"))

    return nombre_pris

# ------------------------------------------------------------------------
# 10 - Et ajouter un affichage dans tour_jeu du nombre restant
# ------------------------------------------------------------------------
def tour_jeu(no_joueur, nombre_batonnets):
    print("Joueur no.", no_joueur)
    nombre_pris = choix_joueur(nombre_batonnets)

    nombre_batonnets -= nombre_pris
    if nombre_batonnets == 0:
        print("Félicitations !! Vous avez gagné !")
        return 0
    else:
        print("Il reste ", nombre_batonnets, "batonnets.")
        str_batonnets = ''
        for x in range(nombre_batonnets):
            str_batonnets += '|'
            # OU plus court (en python seulement !) : str_batonnets = '|'*nombre_batonnets
        print(str_batonnets)
        return nombre_batonnets